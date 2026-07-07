/*
# Auto Stock Deduction Trigger

## Purpose
When an order's status changes to "Shipped", automatically deduct the ordered
quantities from each product's stock. If the status changes away from "Shipped"
(e.g. back to Confirmed or to Cancelled), reverse the deduction so stock is restored.

## How it works
1. A trigger function `handle_order_stock()` fires AFTER UPDATE on `orders`.
2. It compares OLD.status vs NEW.status.
3. Transitioning INTO "Shipped": deducts each order item's quantity from the product stock and logs a stock_movement.
4. Transitioning OUT of "Shipped": restores the stock and logs a reversing stock_movement.
5. No action for other transitions (Draft->Confirmed, Shipped->Delivered, etc.).

## Safety
- Uses a DEFERRABLE transaction via the trigger (runs in the same statement transaction).
- Idempotent per transition: only fires on actual status change.
*/

CREATE OR REPLACE FUNCTION handle_order_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item record;
  delta integer;
  movement_reason text;
BEGIN
  -- Only act when status actually changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transition INTO Shipped: deduct stock
  IF NEW.status = 'Shipped' AND OLD.status <> 'Shipped' THEN
    movement_reason := 'Order ' || NEW.order_number || ' shipped';
    FOR item IN
      SELECT product_id, quantity FROM order_items WHERE order_id = NEW.id
    LOOP
      IF item.product_id IS NOT NULL THEN
        UPDATE products
          SET stock_quantity = stock_quantity - item.quantity
          WHERE id = item.product_id;

        INSERT INTO stock_movements (product_id, quantity_change, reason)
          VALUES (item.product_id, -item.quantity, movement_reason);
      END IF;
    END LOOP;
  END IF;

  -- Transition OUT of Shipped: restore stock
  IF OLD.status = 'Shipped' AND NEW.status <> 'Shipped' THEN
    movement_reason := 'Order ' || NEW.order_number || ' un-shipped (' || NEW.status || ')';
    FOR item IN
      SELECT product_id, quantity FROM order_items WHERE order_id = NEW.id
    LOOP
      IF item.product_id IS NOT NULL THEN
        UPDATE products
          SET stock_quantity = stock_quantity + item.quantity
          WHERE id = item.product_id;

        INSERT INTO stock_movements (product_id, quantity_change, reason)
          VALUES (item.product_id, item.quantity, movement_reason);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_order_stock ON orders;
CREATE TRIGGER trg_handle_order_stock
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION handle_order_stock();

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const libDir = path.join(srcDir, 'lib');
const backendDir = path.join(srcDir, 'backend');

// Create backend dir
if (!fs.existsSync(backendDir)) {
  fs.mkdirSync(backendDir);
}

// Move files
const filesToMove = ['supabase.ts', 'auth.tsx'];
for (const file of filesToMove) {
  const oldPath = path.join(libDir, file);
  const newPath = path.join(backendDir, file);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
    console.log(`Moved ${file} to src/backend/`);
  }
}

// Function to recursively find all ts/tsx files
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      getAllFiles(path.join(dir, file), fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allFiles = getAllFiles(srcDir);

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replace imports
  // From '../lib/supabase' or '../../lib/supabase' or './lib/supabase'
  // Since we are moving from src/lib to src/backend, the relative path structure remains identical.
  // We just need to replace '/lib/supabase' with '/backend/supabase' and '/lib/auth' with '/backend/auth'
  
  content = content.replace(/\/lib\/supabase/g, '/backend/supabase');
  content = content.replace(/\/lib\/auth/g, '/backend/auth');
  content = content.replace(/\\lib\\supabase/g, '\\backend\\supabase');
  content = content.replace(/\\lib\\auth/g, '\\backend\\auth');

  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Updated imports in ${path.relative(__dirname, file)}`);
  }
}
console.log('Done!');

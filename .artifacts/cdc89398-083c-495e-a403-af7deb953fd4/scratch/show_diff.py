import os, difflib

extracted_dir = r'C:\Users\user\AndroidStudioProjects\kakeibo\.artifacts\cdc89398-083c-495e-a403-af7deb953fd4\scratch\extracted_zip'
current_dir = r'C:\Users\user\AndroidStudioProjects\kakeibo'

compare_files = [
    r'app\src\main\assets\app.js',
    r'app\src\main\assets\index.html',
    r'app\src\main\assets\style.css',
    r'app\src\main\java\com\my\myapplication\MainActivity.kt',
    r'app\src\main\java\com\my\myapplication\DatabaseHelper.kt',
    r'app\build.gradle.kts',
    r'app\src\main\AndroidManifest.xml'
]

for rel_path in compare_files:
    p1 = os.path.join(extracted_dir, rel_path)
    p2 = os.path.join(current_dir, rel_path)
    if not os.path.exists(p1) or not os.path.exists(p2):
        print(f"Skipping {rel_path}: file missing")
        continue

    with open(p1, 'r', encoding='utf-8', errors='ignore') as f1, open(p2, 'r', encoding='utf-8', errors='ignore') as f2:
        c1 = f1.readlines()
        c2 = f2.readlines()

    diff = list(difflib.unified_diff(c2, c1, fromfile='current/' + rel_path, tofile='zip/' + rel_path, lineterm=''))
    if diff:
        print(f"=== DIFF FOR {rel_path} ({len(diff)} lines changed) ===")
        for line in diff[:30]: # print first 30 lines of diff
            print(line)
        if len(diff) > 30:
            print("... (truncated)")
    else:
        print(f"--- NO DIFF FOR {rel_path} ---")

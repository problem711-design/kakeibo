import zipfile, os

apk_path = r'C:\Users\user\OneDrive\デスクトップ\フリマ\簡単家計簿+ 1.0.apk'
output_dir = r'C:\Users\user\AndroidStudioProjects\kakeibo\app\src\main\assets'

os.makedirs(output_dir, exist_ok=True)

with zipfile.ZipFile(apk_path, 'r') as z:
    for name in z.namelist():
        if name.startswith('assets/'):
            rel_name = name[len('assets/'):]
            if not rel_name:
                continue
            target_path = os.path.join(output_dir, rel_name)
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with z.open(name) as src, open(target_path, 'wb') as dst:
                dst.write(src.read())
            print(f"Extracted asset: {rel_name}")

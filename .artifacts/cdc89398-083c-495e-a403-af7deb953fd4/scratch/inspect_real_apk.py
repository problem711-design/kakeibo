import zipfile, hashlib, os

apk_path = r'C:\Users\user\OneDrive\デスクトップ\フリマ\簡単家計簿+ 1.0.apk'

print("=== Inspecting Real Device APK ===")
with zipfile.ZipFile(apk_path, 'r') as z:
    for name in z.namelist():
        if 'assets/' in name or 'AndroidManifest.xml' in name or 'classes' in name:
            info = z.getinfo(name)
            print(f"File: {name}, Size: {info.file_size}")

import os
import shutil

src_proj = r'C:\Users\user\OneDrive\デスクトップ\フリマ\kakeibo_android_project\KakeiboProject'
dst_proj = r'C:\Users\user\AndroidStudioProjects\kakeibo'

# 1. Copy java files
src_java = os.path.join(src_proj, 'app', 'src', 'main', 'java', 'com', 'my', 'myapplication')
dst_java = os.path.join(dst_proj, 'app', 'src', 'main', 'java', 'com', 'my', 'myapplication')
os.makedirs(dst_java, exist_ok=True)

for f in os.listdir(src_java):
    if f.endswith('.kt'):
        shutil.copy2(os.path.join(src_java, f), os.path.join(dst_java, f))
        print(f"Copied java file: {f}")

# 2. Copy assets
src_assets = os.path.join(src_proj, 'app', 'src', 'main', 'assets')
dst_assets = os.path.join(dst_proj, 'app', 'src', 'main', 'assets')
os.makedirs(dst_assets, exist_ok=True)

if os.path.exists(src_assets):
    for f in os.listdir(src_assets):
        fp = os.path.join(src_assets, f)
        if os.path.isfile(fp):
            shutil.copy2(fp, os.path.join(dst_assets, f))
            print(f"Copied asset: {f}")

print("Copy completed successfully.")

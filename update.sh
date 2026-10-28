#!/usr/bin/env bash
set -e

echo "===================================================="
echo "    NEXUS GameNet - دریافت و نصب خودکار آپدیت جدید"
echo "===================================================="

# ۱. بک‌آپ اضطراری
mkdir -p backups
if [ -f "data/nexus_db.json" ]; then
    echo "[1/4] پشتیبان‌گیری از دیتابیس فعلی..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    cp "data/nexus_db.json" "backups/nexus_db_${TIMESTAMP}.bak"
    echo "دیتابیس فعلی در پوشه backups ذخیره شد."
fi

# ۲. پول کردن از گیت‌هاب
echo ""
echo "[2/4] دریافت تغییرات جدید از گیت‌هاب..."
git pull origin main

# ۳. نصب وابستگی‌های جدید
echo ""
echo "[3/4] بررسی و نصب وابستگی‌ها..."
npm install --no-audit

# ۴. بیلد برنامه
echo ""
echo "[4/4] بیلد برنامه..."
npm run build

echo ""
echo "===================================================="
echo "   آپدیت با موفقیت نصب شد و دیتابیس کاملاً حفظ گردید!"
echo "===================================================="

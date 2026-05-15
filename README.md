# OrgManager HR — Frontend

ระบบ Frontend สำหรับแอป HR ครบวงจร  
สร้างด้วย **Next.js 14 + TypeScript + Tailwind CSS**

---

## โครงสร้างไฟล์

```
hr-frontend/
├── src/
│   ├── app/
│   │   ├── globals.css           ← Global styles + design system
│   │   ├── layout.tsx            ← Root layout + Auth provider
│   │   ├── page.tsx              ← Redirect → /dashboard
│   │   ├── login/page.tsx        ← หน้า Login (3 roles)
│   │   └── (dashboard)/
│   │       ├── layout.tsx        ← Dashboard layout + Sidebar
│   │       ├── dashboard/page.tsx← Dashboard หลัก
│   │       ├── attendance/page.tsx← เช็คอิน GPS
│   │       └── leave/page.tsx    ← ระบบการลา
│   ├── components/
│   │   └── layout/
│   │       └── Sidebar.tsx       ← Sidebar navigation
│   └── lib/
│       ├── api.ts                ← Axios + API functions ทั้งหมด
│       └── store.ts              ← Zustand auth state
├── .env.example
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## วิธีติดตั้งและรัน

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. ตั้งค่า environment
cp .env.example .env.local
# แก้ไข NEXT_PUBLIC_API_URL ให้ชี้ไป Backend

# 3. รัน Backend ก่อน (hr-backend)
# ดูวิธีใน hr-backend/README.md

# 4. รัน Frontend
npm run dev
# เปิด http://localhost:3000
```

---

## หน้าที่มีแล้ว

| หน้า | URL | ใครเข้าได้ |
|------|-----|-----------|
| Login | /login | ทุกคน |
| Dashboard | /dashboard | ทุก Role |
| เช็คอิน GPS | /attendance | ทุก Role |
| การลา | /leave | ทุก Role |

---

## หน้าที่ต้องสร้างต่อ

```
/ot              ← OT request
/payroll         ← สลิปเงินเดือน
/kpi             ← ประเมิน KPI
/projects        ← โปรเจกต์ (ClickUp-style)
/finance         ← ค่าใช้จ่าย
/cleaning        ← ทำความสะอาด
/announcements   ← ประกาศ
/recruit         ← สรรหาพนักงาน
/org-chart       ← แผนผังองค์กร
/settings        ← ตั้งค่า
```

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **HTTP**: Axios (พร้อม token refresh อัตโนมัติ)
- **Charts**: Recharts
- **Icons**: @tabler/icons-react
- **Font**: IBM Plex Sans Thai (Google Fonts)

---

## การ Deploy (Vercel)

```bash
# 1. Push โค้ดขึ้น GitHub
# 2. ไปที่ vercel.com → Import Repository
# 3. ตั้งค่า Environment Variables:
#    NEXT_PUBLIC_API_URL = https://your-backend.railway.app/api
# 4. Deploy อัตโนมัติ
```

---

## บัญชีทดลอง

| อีเมล | รหัสผ่าน | Role |
|-------|---------|------|
| owner@company.co.th | 1234 | เจ้าของ |
| hr@company.co.th | 1234 | HR Admin |
| somchai@company.co.th | 1234 | พนักงาน |

*(ต้อง seed ข้อมูลใน Backend ก่อน)*

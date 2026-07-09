import { useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../data/store";
import "./AppShell.css";

const NAV_ITEMS = [
  { to: "/", label: "แดชบอร์ด", icon: "◧", end: true },
  { to: "/form", label: "ฟอร์มสำรวจ", icon: "✎", end: false },
  { to: "/submissions", label: "ข้อมูลที่ส่งเข้ามา", icon: "≡", end: false },
  { to: "/scheduler", label: "จัดตารางสอบ", icon: "▦", end: false },
  { to: "/publish", label: "ตารางสอบเผยแพร่", icon: "⎙", end: false },
];

const ADMIN_NAV_ITEM = { to: "/admin", label: "ตั้งค่ารอบสอบ", icon: "⚙", end: false };
const EXAM_UPLOAD_NAV_ITEM = { to: "/exam-upload", label: "ส่งข้อสอบ", icon: "📤", end: false };

const BOTTOM_NAV_ITEMS = [
  { to: "/", label: "แดชบอร์ด", icon: "◧", end: true },
  { to: "/submissions", label: "รายวิชา", icon: "≡", end: false },
  { to: "/scheduler", label: "จัดตาราง", icon: "▦", end: false },
  { to: "/publish", label: "เผยแพร่", icon: "⎙", end: false },
];

function AdminStatus() {
  const { isAdmin, unlockAdmin, lockAdmin } = useStore();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockAdmin(password)) {
      setOpen(false);
      setPassword("");
      setError(null);
    } else {
      setError("รหัสผ่านไม่ถูกต้อง");
    }
  }

  if (isAdmin) {
    return (
      <button
        type="button"
        className="shell-user shell-user-btn"
        onClick={() => {
          if (window.confirm("ออกจากโหมดผู้ดูแลระบบใช่หรือไม่?")) lockAdmin();
        }}
      >
        <div className="shell-avatar">🔓</div>
        <div className="shell-user-info">
          <div className="shell-user-name">ผู้ดูแลระบบ (ปลดล็อกแล้ว)</div>
          <div className="shell-user-role">แตะเพื่อออกจากโหมดผู้ดูแล</div>
        </div>
      </button>
    );
  }

  return (
    <>
      <button type="button" className="shell-user shell-user-btn" onClick={() => setOpen(true)}>
        <div className="shell-avatar">🔒</div>
        <div className="shell-user-info">
          <div className="shell-user-name">เข้าสู่โหมดผู้ดูแลระบบ</div>
          <div className="shell-user-role">ฝ่ายวิชาการ</div>
        </div>
      </button>
      {open &&
        createPortal(
          <div className="shell-admin-overlay" onClick={() => setOpen(false)}>
            <form className="shell-admin-modal card" onClick={(e) => e.stopPropagation()} onSubmit={handleUnlock}>
              <div className="shell-admin-title">เข้าสู่โหมดผู้ดูแลระบบ</div>
              <input
                className="tform-input"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="รหัสผ่านผู้ดูแลระบบ"
              />
              {error && <div className="tform-error">{error}</div>}
              <div className="shell-admin-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary">
                  เข้าสู่ระบบ
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

function SchoolLogo({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return <img className="shell-logo shell-logo-img" src={logoUrl} alt="โลโก้โรงเรียน" />;
  }
  return <div className="shell-logo">ตบ</div>;
}

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { state, isAdmin, examMenuEnabled } = useStore();
  const schoolName = state.school?.schoolName ?? "";
  const logoUrl = state.school?.logoUrl ?? null;
  const navItems = [
    ...NAV_ITEMS,
    ...(examMenuEnabled ? [EXAM_UPLOAD_NAV_ITEM] : []),
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ];

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <SchoolLogo logoUrl={logoUrl} />
          <div>
            <div className="shell-brand-title">ระบบจัดการสอบ</div>
            <div className="shell-brand-school">{schoolName}</div>
          </div>
        </div>
        <nav className="shell-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "shell-nav-item" + (isActive ? " active" : "")}
            >
              <span className="shell-nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <AdminStatus />
        <div className="shell-credits">
          <span className="shell-credits-label">พัฒนาโดย</span><br />
          นายกิตติพงษ์ คำดี
        </div>
      </aside>

      <div className="shell-mobile-topbar">
        <button
          className="shell-hamburger"
          aria-label="เปิดเมนู"
          onClick={() => setDrawerOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="shell-mobile-title">
          <div className="shell-mobile-title-main">ระบบจัดการสอบ</div>
          <div className="shell-mobile-title-sub">{schoolName}</div>
        </div>
        <div className="shell-avatar shell-avatar-sm">{isAdmin ? "🔓" : "🔒"}</div>
      </div>

      {drawerOpen && (
        <div className="shell-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="shell-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="shell-brand">
              <SchoolLogo logoUrl={logoUrl} />
              <div>
                <div className="shell-brand-title">ระบบจัดการสอบ</div>
                <div className="shell-brand-school">{schoolName}</div>
              </div>
            </div>
            <nav className="shell-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => "shell-nav-item" + (isActive ? " active" : "")}
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className="shell-nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <AdminStatus />
            <div className="shell-credits">
              <span className="shell-credits-label">พัฒนาโดย</span><br />
              นายกิตติพงษ์ คำดี
            </div>
          </div>
        </div>
      )}

      <main className="shell-main">
        <Outlet />
      </main>

      <nav className="shell-bottomnav">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => "shell-bottomnav-item" + (isActive ? " active" : "")}
          >
            <span className="shell-bottomnav-icon">{item.icon}</span>
            <span className="shell-bottomnav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

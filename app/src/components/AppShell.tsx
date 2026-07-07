import { useState } from "react";
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

const BOTTOM_NAV_ITEMS = [
  { to: "/", label: "แดชบอร์ด", icon: "◧", end: true },
  { to: "/submissions", label: "รายวิชา", icon: "≡", end: false },
  { to: "/scheduler", label: "จัดตาราง", icon: "▦", end: false },
  { to: "/publish", label: "เผยแพร่", icon: "⎙", end: false },
];

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { state } = useStore();
  const schoolName = state.school?.schoolName ?? "";

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <div className="shell-logo">ตบ</div>
          <div>
            <div className="shell-brand-title">ระบบจัดการสอบ</div>
            <div className="shell-brand-school">{schoolName}</div>
          </div>
        </div>
        <nav className="shell-nav">
          {NAV_ITEMS.map((item) => (
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
        <div className="shell-user">
          <div className="shell-avatar">อ</div>
          <div className="shell-user-info">
            <div className="shell-user-name">ผู้ดูแลระบบ</div>
            <div className="shell-user-role">ฝ่ายวิชาการ</div>
          </div>
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
        <div className="shell-avatar shell-avatar-sm">อ</div>
      </div>

      {drawerOpen && (
        <div className="shell-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="shell-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="shell-brand">
              <div className="shell-logo">ตบ</div>
              <div>
                <div className="shell-brand-title">ระบบจัดการสอบ</div>
                <div className="shell-brand-school">{schoolName}</div>
              </div>
            </div>
            <nav className="shell-nav">
              {NAV_ITEMS.map((item) => (
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
            <div className="shell-user">
              <div className="shell-avatar">อ</div>
              <div className="shell-user-info">
                <div className="shell-user-name">ผู้ดูแลระบบ</div>
                <div className="shell-user-role">ฝ่ายวิชาการ</div>
              </div>
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

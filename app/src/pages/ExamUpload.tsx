import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore, useSubmissions } from "../data/store";
import { gradeLabel } from "../data/mockData";
import type { Grade } from "../data/types";
import "./ExamUpload.css";

interface ExamUploadRow {
  id: string;
  teacher_name: string;
  subject_code: string;
  subject_name: string;
  grade: number;
  rooms: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  status: "pending" | "approved" | "rejected";
  copy_status: "waiting_copy" | "copied" | null;
  created_at: string;
}

export default function ExamUpload() {
  const { isAdmin } = useStore();
  const submissions = useSubmissions();

  // ---- form state ----
  const [teacherName, setTeacherName] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- list state ----
  const [rows, setRows] = useState<ExamUploadRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // ---- derived ----
  const uniqueTeachers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of submissions) {
      if (!s.selfScheduled) seen.set(s.teacherName.trim(), s.teacherName.trim());
    }
    return [...seen.values()].sort();
  }, [submissions]);

  const teacherSubs = useMemo(
    () => submissions.filter((s) => !s.selfScheduled && s.teacherName.trim() === teacherName.trim()),
    [submissions, teacherName],
  );

  const selectedSub = useMemo(() => teacherSubs.find((s) => s.id === submissionId) ?? null, [teacherSubs, submissionId]);

  // reset subject when teacher changes
  useEffect(() => { setSubmissionId(""); }, [teacherName]);

  // ---- load list ----
  const loadList = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("exam_uploads")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as ExamUploadRow[]) ?? []);
    setLoadingList(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // ---- file handling ----
  function handleFileChange(f: File | null) {
    if (!f) return;
    if (f.type !== "application/pdf") { setUploadError("รองรับเฉพาะไฟล์ PDF เท่านั้น"); return; }
    setFile(f);
    setUploadError(null);
    setUploadSuccess(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFileChange(e.dataTransfer.files[0] ?? null);
  }

  // ---- upload ----
  async function handleUpload() {
    if (!teacherName || !submissionId || !selectedSub || !file) return;
    setUploading(true);
    setProgress(0);
    setUploadError(null);

    // simulate progress fill while uploading
    const timer = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 5 : p));
    }, 120);

    try {
      const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { data: storageData, error: storageErr } = await supabase.storage
        .from("exam-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = supabase.storage.from("exam-pdfs").getPublicUrl(storageData.path);

      const roomStr = selectedSub.rooms.length > 0 ? selectedSub.rooms.map((r) => `ห้อง ${r}`).join(", ") : "ทุกห้อง";

      const { error: dbErr } = await supabase.from("exam_uploads").insert({
        teacher_name: selectedSub.teacherName,
        subject_code: selectedSub.code,
        subject_name: selectedSub.subjectName,
        grade: selectedSub.grade,
        rooms: roomStr,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        status: "pending",
        copy_status: null,
      });
      if (dbErr) throw dbErr;

      clearInterval(timer);
      setProgress(100);
      setUploadSuccess(true);
      setFile(null);
      setTeacherName("");
      setSubmissionId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadList();
    } catch (err) {
      clearInterval(timer);
      setUploadError((err as Error).message ?? "อัพโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  // ---- status update (admin only) ----
  async function handleStatusChange(id: string, status: "pending" | "approved" | "rejected") {
    await supabase.from("exam_uploads").update({
      status,
      copy_status: status === "approved" ? "waiting_copy" : null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, status, copy_status: status === "approved" ? "waiting_copy" : null } : r));
  }

  // ---- copy status toggle (no admin needed) ----
  async function handleCopyToggle(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status !== "approved") return;
    const next = row.copy_status === "waiting_copy" ? "copied" : "waiting_copy";
    await supabase.from("exam_uploads").update({ copy_status: next, updated_at: new Date().toISOString() }).eq("id", id);
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, copy_status: next } : r));
  }

  const canUpload = !!teacherName && !!submissionId && !!file && !uploading;

  return (
    <div className="exup-page">
      <div className="page-header">
        <div>
          <h1>ส่งข้อสอบ</h1>
          <div className="page-subtitle">อัพโหลดไฟล์ข้อสอบ PDF สำหรับสำเนาและตรวจต้นฉบับ</div>
        </div>
      </div>

      {/* ---- Upload form ---- */}
      <div className="card exup-form-card">
        <div className="exup-form-title">อัพโหลดข้อสอบ</div>

        <div className="exup-form-grid">
          {/* teacher */}
          <div className="exup-field">
            <label className="exup-label">ชื่อครู</label>
            <select
              className="exup-select"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
            >
              <option value="">— เลือกชื่อครู —</option>
              {uniqueTeachers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* subject */}
          <div className="exup-field">
            <label className="exup-label">รายวิชา</label>
            <select
              className="exup-select"
              value={submissionId}
              onChange={(e) => setSubmissionId(e.target.value)}
              disabled={!teacherName}
            >
              <option value="">— เลือกรายวิชา —</option>
              {teacherSubs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.subjectName} · {gradeLabel(s.grade as Grade)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* auto-filled info */}
        {selectedSub && (
          <div className="exup-info-row">
            <div className="exup-info-chip"><span className="exup-info-label">รหัสวิชา</span>{selectedSub.code}</div>
            <div className="exup-info-chip"><span className="exup-info-label">ชื่อวิชา</span>{selectedSub.subjectName}</div>
            <div className="exup-info-chip"><span className="exup-info-label">ชั้น</span>{gradeLabel(selectedSub.grade as Grade)}</div>
            <div className="exup-info-chip">
              <span className="exup-info-label">ห้อง</span>
              {selectedSub.rooms.length > 0 ? selectedSub.rooms.map((r) => `ห้อง ${r}`).join(", ") : "ทุกห้อง"}
            </div>
          </div>
        )}

        {/* drop zone */}
        <div
          className={"exup-dropzone" + (dragging ? " drag-over" : "") + (file ? " has-file" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="exup-file-input"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="exup-dropzone-file">
              <span className="exup-pdf-icon">📄</span>
              <span className="exup-dropzone-name">{file.name}</span>
              <span className="exup-dropzone-size">({(file.size / 1024).toFixed(0)} KB)</span>
            </div>
          ) : (
            <div className="exup-dropzone-hint">
              <span className="exup-dropzone-icon">⬆</span>
              <div>วางไฟล์ PDF ที่นี่ หรือ<span className="exup-dropzone-link">คลิกเพื่อเลือกไฟล์</span></div>
              <div className="exup-dropzone-sub">รองรับเฉพาะไฟล์ PDF เท่านั้น (สูงสุด 50 MB)</div>
            </div>
          )}
        </div>

        {/* progress bar */}
        {(uploading || progress > 0) && (
          <div className="exup-progress-wrap">
            <div className="exup-progress-bar">
              <div className="exup-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="exup-progress-pct">{progress}%</span>
          </div>
        )}

        {uploadError && <div className="exup-error">{uploadError}</div>}
        {uploadSuccess && <div className="exup-success">อัพโหลดสำเร็จแล้ว</div>}

        <div className="exup-form-actions">
          {file && (
            <button type="button" className="btn btn-ghost" onClick={() => { setFile(null); setUploadError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
              ยกเลิกไฟล์
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canUpload}
            onClick={handleUpload}
          >
            {uploading ? "กำลังอัพโหลด…" : "อัพโหลด"}
          </button>
        </div>
      </div>

      {/* ---- Uploaded list ---- */}
      <div className="card exup-list-card">
        <div className="exup-list-title">รายการที่อัพโหลดแล้ว</div>

        {loadingList ? (
          <div className="exup-list-empty">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="exup-list-empty">ยังไม่มีรายการ</div>
        ) : (
          <div className="exup-table-wrap">
            <div className="exup-table">
              <div className="exup-row exup-head">
                <span>#</span>
                <span>ชื่อครู</span>
                <span>รหัสวิชา</span>
                <span>ชื่อวิชา</span>
                <span>ชั้น</span>
                <span>ห้อง</span>
                <span>ไฟล์ข้อสอบ</span>
                <span>สถานะ</span>
                <span>หมายเหตุ</span>
              </div>
              {rows.map((row, i) => (
                <div className="exup-row" key={row.id}>
                  <span className="exup-cell-num">{i + 1}</span>
                  <span>{row.teacher_name}</span>
                  <span className="exup-cell-code">{row.subject_code}</span>
                  <span>{row.subject_name}</span>
                  <span>{gradeLabel(row.grade as Grade)}</span>
                  <span>{row.rooms ?? "—"}</span>
                  <span>
                    <a className="exup-file-link" href={row.file_url} target="_blank" rel="noreferrer">
                      📄 {row.file_name}
                    </a>
                  </span>
                  <span>
                    {isAdmin ? (
                      <select
                        className={"exup-status-select exup-status-" + row.status}
                        value={row.status}
                        onChange={(e) => handleStatusChange(row.id, e.target.value as "pending" | "approved" | "rejected")}
                      >
                        <option value="pending">รออนุมัติ</option>
                        <option value="approved">อนุมัติ</option>
                        <option value="rejected">ไม่อนุมัติ</option>
                      </select>
                    ) : (
                      <span className={"exup-status-badge exup-status-" + row.status}>
                        {row.status === "pending" ? "รออนุมัติ" : row.status === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"}
                      </span>
                    )}
                  </span>
                  <span>
                    {row.status === "approved" ? (
                      <button
                        type="button"
                        className={"exup-copy-btn" + (row.copy_status === "copied" ? " copied" : "")}
                        onClick={() => handleCopyToggle(row.id)}
                      >
                        {row.copy_status === "copied" ? "สำเนาเรียบร้อย" : "รอสำเนา"}
                      </button>
                    ) : (
                      <span className="exup-copy-na">—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

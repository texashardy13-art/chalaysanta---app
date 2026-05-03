import { useState, useEffect, useRef } from "react";
import { db, auth, storage } from "./firebase";
import { ref, onValue, set, update } from "firebase/database";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { INITIAL_DATA } from "./initialData";

// v4 - mobile fix + gauges + countdown fix
const VIEWER_PASS = "chalaysanta2026";
const ADMIN_EMAIL = "texashardy13@gmail.com";

export default function App() {
  const [role, setRole] = useState(null); // null | "viewer" | "admin"
  const [data, setData] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [loginPass, setLoginPass] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginTab, setLoginTab] = useState("viewer"); // "viewer" | "admin"
  const [panel, setPanel] = useState(null); // { type, index }
  const [panelData, setPanelData] = useState({});
  const [savingMsg, setSavingMsg] = useState(false);
  const [countdown, setCountdown] = useState({});
  const [openCards, setOpenCards] = useState({});
  const [activeTab, setActiveTab] = useState({});
  const countdownRef = useRef();

  // ── FIREBASE REALTIME LISTENER ──
  useEffect(() => {
    const dbRef = ref(db, "chalaysanta");
    const unsub = onValue(dbRef, (snapshot) => {
      if (snapshot.exists()) {
        setData(snapshot.val());
      } else {
        // Primera vez: carga datos iniciales
        set(ref(db, "chalaysanta"), INITIAL_DATA);
        setData(INITIAL_DATA);
      }
    });
    return () => unsub();
  }, []);

  // ── AUTH STATE ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) {
        setRole("admin");
      }
    });
    return () => unsub();
  }, []);

  // ── COUNTDOWN ──
  const fechaISORef = useRef(null);
  useEffect(() => {
    if (!data?.header?.fechaISO) return;
    // Only restart if fechaISO actually changed
    if (fechaISORef.current === data.header.fechaISO) return;
    fechaISORef.current = data.header.fechaISO;
    clearInterval(countdownRef.current);
    const tick = () => {
      const now = new Date();
      const target = new Date(fechaISORef.current);
      const diff = target - now;
      if (diff <= 0) {
        setCountdown({ finished: true });
        clearInterval(countdownRef.current);
        return;
      }
      const dias = Math.floor(diff / 86400000);
      const horas = Math.floor((diff % 86400000) / 3600000);
      const min = Math.floor((diff % 3600000) / 60000);
      const seg = Math.floor((diff % 60000) / 1000);
      setCountdown({ dias, horas, min, seg });
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [data?.header?.fechaISO]);

  // ── LOGIN ──
  const doViewerLogin = () => {
    if (loginPass === VIEWER_PASS) {
      setRole("viewer");
      setLoginError("");
    } else {
      setLoginError("Contraseña incorrecta");
    }
  };

  const doAdminLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      setRole("admin");
      setLoginError("");
    } catch {
      setLoginError("Correo o contraseña incorrectos");
    }
  };

  const doLogout = async () => {
    if (role === "admin") await signOut(auth);
    setRole(null);
    setAdminMode(false);
    setLoginPass("");
    setAdminPass("");
    setLoginError("");
  };

  // ── SAVE TO FIREBASE ──
  const saveToFirebase = async (path, value) => {
    await update(ref(db, `chalaysanta/${path}`), value);
  };

  // ── IMAGE UPLOAD ──
  const handleImageUpload = async (file, type) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      await update(ref(db, "chalaysanta/images"), { [type]: base64 });
    };
    reader.readAsDataURL(file);
  };

  // ── PANEL ──
  const openPanel = (type, index = null) => {
    setPanel({ type, index });
    if (type === "header") {
      setPanelData({
        titulo1: data.header.titulo1,
        titulo2: data.header.titulo2,
        sub: data.header.sub,
        fechaEvento: data.header.fechaEvento,
        fechaISO: data.header.fechaISO,
        fecha: data.header.fecha,
        ubicacion: data.header.ubicacion,
        estado: data.header.estado,
        fecha1: data.alertas.fecha1,
        desc1: data.alertas.desc1,
        fecha2: data.alertas.fecha2,
        desc2: data.alertas.desc2,
        fnombre: data.footer.nombre,
        flugar: data.footer.lugar,
        ffecha: data.footer.fecha,
        fminuta: data.footer.minuta,
      });
    } else if (type === "comision") {
      const c = data.comisiones[index];
      setPanelData({ ...c, tareasText: (c.tareas || []).join("\n") });
    }
  };

  const closePanel = () => { setPanel(null); setPanelData({}); };

  const savePanel = async () => {
    if (panel.type === "header") {
      await update(ref(db, "chalaysanta/header"), {
        titulo1: panelData.titulo1 || "",
        titulo2: panelData.titulo2 || "",
        sub: panelData.sub || "",
        fechaEvento: panelData.fechaEvento || "",
        fechaISO: panelData.fechaISO || "",
        fecha: panelData.fecha || "",
        ubicacion: panelData.ubicacion || "",
        estado: panelData.estado || "",
      });
      await update(ref(db, "chalaysanta/alertas"), {
        fecha1: panelData.fecha1 || "",
        desc1: panelData.desc1 || "",
        fecha2: panelData.fecha2 || "",
        desc2: panelData.desc2 || "",
      });
      await update(ref(db, "chalaysanta/footer"), {
        nombre: panelData.fnombre || "",
        lugar: panelData.flugar || "",
        fecha: panelData.ffecha || "",
        minuta: panelData.fminuta || "",
      });
    } else if (panel.type === "comision") {
      const updated = {
        ...panelData,
        tareas: (panelData.tareasText || "").split("\n").map(t => t.trim()).filter(Boolean),
      };
      delete updated.tareasText;
      const comisiones = [...(data.comisiones || [])];
      comisiones[panel.index] = updated;
      await set(ref(db, "chalaysanta/comisiones"), comisiones);
    }
    setSavingMsg(true);
    setTimeout(() => { setSavingMsg(false); closePanel(); }, 1500);
  };

  const toggleReq = async (cardIdx, reqIdx) => {
    const comisiones = JSON.parse(JSON.stringify(data.comisiones));
    comisiones[cardIdx].requerimientos[reqIdx].done = !comisiones[cardIdx].requerimientos[reqIdx].done;
    await set(ref(db, "chalaysanta/comisiones"), comisiones);
  };

  const addReq = () => {
    const reqs = [...(panelData.requerimientos || []), { nombre: "", detalle: "", cantidad: "", monto: "", done: false }];
    setPanelData({ ...panelData, requerimientos: reqs });
  };

  const deleteReq = (ri) => {
    const reqs = (panelData.requerimientos || []).filter((_, i) => i !== ri);
    setPanelData({ ...panelData, requerimientos: reqs });
  };

  const updateReq = (ri, field, value) => {
    const reqs = [...(panelData.requerimientos || [])];
    reqs[ri] = { ...reqs[ri], [field]: value };
    setPanelData({ ...panelData, requerimientos: reqs });
  };

  // ── LOADING ──
  if (!data) return (
    <div style={{ position: "fixed", inset: 0, background: "#1a2744", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "rgba(255,255,255,0.6)", fontFamily: "sans-serif", fontSize: 14, letterSpacing: 3, textTransform: "uppercase" }}>Cargando...</div>
    </div>
  );

  // ── LOGIN SCREEN ──
  if (!role) return (
    <div style={{ position: "fixed", inset: 0, background: "#1a2744", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Sans:wght@300;400;500&display=swap');`}</style>
      <div style={{ background: "#fff", padding: "40px 48px", width: "100%", maxWidth: 420, borderTop: "4px solid #c47b1a" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#1a2744", marginBottom: 4 }}>
          Acceso al Sistema
        </div>
        <div style={{ fontSize: 12, color: "#6b6560", marginBottom: 28, letterSpacing: 0.5 }}>Comité Ejecutivo · San Jerónimo de Tunán</div>

        {/* Tabs */}
        <div style={{ display: "flex", marginBottom: 24, borderBottom: "2px solid #d8d4cc" }}>
          {["viewer", "admin"].map(t => (
            <button key={t} onClick={() => { setLoginTab(t); setLoginError(""); }}
              style={{ flex: 1, padding: "10px", background: "none", border: "none", borderBottom: loginTab === t ? "2px solid #1a2744" : "2px solid transparent", marginBottom: -2, cursor: "pointer", fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: loginTab === t ? "#1a2744" : "#6b6560", fontWeight: loginTab === t ? 700 : 400 }}>
              {t === "viewer" ? "👁 Invitado" : "⚙ Administrador"}
            </button>
          ))}
        </div>

        {loginTab === "viewer" ? (
          <>
            <label style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6b6560", display: "block", marginBottom: 6 }}>Contraseña de acceso</label>
            <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doViewerLogin()}
              placeholder="Ingresa la contraseña"
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #d8d4cc", fontSize: 14, marginBottom: 20, outline: "none", boxSizing: "border-box" }} />
            <button onClick={doViewerLogin}
              style={{ width: "100%", padding: 12, background: "#1a2744", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", border: "none", cursor: "pointer", fontWeight: 700 }}>
              Ingresar
            </button>
          </>
        ) : (
          <>
            <label style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6b6560", display: "block", marginBottom: 6 }}>Correo</label>
            <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
              placeholder="tu@correo.com"
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #d8d4cc", fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            <label style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6b6560", display: "block", marginBottom: 6 }}>Contraseña</label>
            <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doAdminLogin()}
              placeholder="Contraseña de administrador"
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #d8d4cc", fontSize: 14, marginBottom: 20, outline: "none", boxSizing: "border-box" }} />
            <button onClick={doAdminLogin}
              style={{ width: "100%", padding: 12, background: "#c47b1a", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", border: "none", cursor: "pointer", fontWeight: 700 }}>
              Ingresar como Admin
            </button>
          </>
        )}
        {loginError && <div style={{ fontSize: 12, color: "#9b2020", marginTop: 10 }}>{loginError}</div>}
      </div>
    </div>
  );

  const isAdmin = role === "admin";
  const h = data.header;
  const a = data.alertas;
  const f = data.footer;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "#f4f2ee", minHeight: "100vh", color: "#1a1a1a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{
          --primary:#1a2744;--accent:#2c5f8a;--accent2:#c47b1a;
          --bg:#f4f2ee;--surface:#fff;--border:#d8d4cc;
          --text:#1a1a1a;--muted:#6b6560;--alert:#9b2020;
          --alert-bg:#fdf0f0;--success:#1a5c38;--success-bg:#edf7f1;
        }
        @keyframes titleReveal{0%{opacity:0;transform:translateY(40px) scale(0.95);}60%{opacity:1;transform:translateY(-6px) scale(1.01);}100%{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes titleAccent{0%{opacity:0;transform:translateX(-30px);}50%{opacity:1;transform:translateX(4px);}100%{opacity:1;transform:translateX(0);}}
        @keyframes glowPulse{0%,100%{text-shadow:0 0 20px rgba(196,123,26,0.3);}50%{text-shadow:0 0 40px rgba(196,123,26,0.7),0 0 80px rgba(196,123,26,0.2);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .title1-anim{animation:titleReveal 0.9s cubic-bezier(.22,.68,0,1.2) 0.3s both;}
        .title2-anim{animation:titleAccent 0.9s cubic-bezier(.22,.68,0,1.2) 0.7s both, glowPulse 3s ease-in-out 1.8s infinite;}
        .card-anim{animation:fadeUp 0.4s ease both;}
        .cover-hover:hover .cover-overlay{opacity:1!important;}
        input:focus,textarea:focus,select:focus{outline:2px solid #2c5f8a;}
        @media(max-width:600px){
          .title2-anim{word-break:break-word!important;max-width:100%!important;font-size:clamp(26px,8vw,48px)!important;}
          .title1-anim{font-size:clamp(22px,7vw,40px)!important;}
          .cd-boxes-resp{gap:3px!important;}
          .cd-box-resp{min-width:44px!important;padding:7px 6px!important;}
          .cd-num-resp{font-size:18px!important;}
          .cd-unit-resp{font-size:7px!important;}
          .cd-sep-resp{font-size:14px!important;margin-bottom:10px!important;}
          .header-body-resp{padding:20px 16px 24px!important;}
          .topbar-resp{padding:10px 16px!important;}
          .topbar-title{display:none!important;}
          .alert-resp{padding:12px 16px!important;flex-direction:column!important;gap:8px!important;}
          .alert-dates-resp{flex-direction:column!important;gap:8px!important;}
          .main-resp{padding:20px 16px!important;}
          .footer-resp{padding:12px 16px!important;font-size:10px!important;}
          .panel-resp{width:100vw!important;}
          .header-meta-resp{gap:14px!important;}
        }
      `}</style>

      {/* ADMIN BAR */}
      {isAdmin && adminMode && (
        <div style={{ background: "#c47b1a", color: "#fff", padding: "8px 20px", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", alignItems: "center", fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
          <span>⚙ Modo Administrador activo</span>
          <button onClick={() => openPanel("header")} style={adminBtn}>✎ Editar encabezado</button>
          <button onClick={() => openPanel("images")} style={adminBtn}>🖼 Editar imágenes</button>
        </div>
      )}

      {/* TOPBAR */}
      <div style={{ background: "#1a2744", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 8 }}>
        <span className="topbar-title" style={{ fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Comité Ejecutivo · San Jerónimo de Tunán</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {isAdmin && <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", background: "#c47b1a", color: "#fff", padding: "3px 10px" }}>Admin</span>}
          {isAdmin && (
            <button onClick={() => setAdminMode(m => !m)} style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.8)", padding: "6px 14px", cursor: "pointer" }}>
              {adminMode ? "✕ Salir de edición" : "✎ Editar página"}
            </button>
          )}
          <button onClick={doLogout} style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", padding: "6px 14px", cursor: "pointer" }}>Salir</button>
        </div>
      </div>

      {/* HEADER */}
      <header style={{ background: "#1a2744", color: "#fff", position: "relative", overflow: "hidden" }}>
        {/* Cover image */}
        <div className="cover-hover" style={{ width: "100%", height: 260, overflow: "hidden", position: "relative", background: "#0d1b35" }}>
          {data.images?.cover
            ? <img src={data.images.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#0d1b35 0%,#1a2744 60%,#2c5f8a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.2)", textTransform: "uppercase" }}>📷 Imagen de portada</div>
          }
          {isAdmin && adminMode && (
            <label className="cover-overlay" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", opacity: 0, cursor: "pointer", transition: "opacity .2s" }}>
              <span style={{ background: "rgba(196,123,26,0.9)", border: "2px solid rgba(255,255,255,0.5)", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", padding: "10px 22px" }}>🖼 Cambiar portada</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0], "cover")} />
            </label>
          )}
        </div>

        {/* Header body */}
        <div className="header-body-resp" style={{ padding: "36px 48px 40px", position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "inline-block", background: "#c47b1a", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", padding: "5px 14px", borderRadius: 2, marginBottom: 20 }}>
            Evento Oficial · {h.fechaEvento}
          </div>
          <h1 className="title1-anim" style={{ fontFamily: "'Syne',sans-serif", fontSize: "clamp(24px,7vw,52px)", fontWeight: 800, lineHeight: 1.1, color: "#fff", marginBottom: 6, wordBreak: "break-word", maxWidth: "100%" }}>
            {h.titulo1}
          </h1>
          <h1 className="title2-anim" style={{ fontFamily: "'Syne',sans-serif", fontSize: "clamp(24px,8vw,62px)", fontWeight: 800, lineHeight: 1.1, color: "#c47b1a", marginBottom: 14, wordBreak: "break-word", overflowWrap: "anywhere", maxWidth: "100%" }}>
            {h.titulo2}
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 28, fontWeight: 300 }}>{h.sub}</p>

          {/* COUNTDOWN */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
              {countdown.finished ? "🎉 ¡El evento ha comenzado!" : "Faltan para el evento"}
            </div>
            {!countdown.finished && (
              <div className="cd-boxes-resp" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", overflowX: "auto", maxWidth: "100%", paddingBottom: 4 }}>
                {[["dias","días"],["horas","horas"],["min","min"],["seg","seg"]].map(([key, label], i) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="cd-box-resp" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", textAlign: "center", minWidth: 60, flex: "1 1 60px", backdropFilter: "blur(4px)" }}>
                      <span className="cd-num-resp" style={{ display: "block", fontFamily: "'Syne',sans-serif", fontSize: "clamp(18px,5vw,32px)", fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                        {String(countdown[key] ?? "--").padStart(2, "0")}
                      </span>
                      <span className="cd-unit-resp" style={{ display: "block", fontFamily: "'Syne',sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{label}</span>
                    </div>
                    {i < 3 && <span className="cd-sep-resp" style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 700, color: "#c47b1a", marginBottom: 14 }}>:</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="header-meta-resp" style={{ display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
            {[["Ubicación", h.ubicacion], ["Fecha del evento", h.fecha], ["Total de comisiones", `${(data.comisiones || []).length} comisiones`], ["Estado general", h.estado]].map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
                <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontFamily: "'Syne',sans-serif" }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ALERT BANNER */}
      <div className="alert-resp" style={{ background: "#c47b1a", padding: "18px 48px", display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div style={{ width: 36, height: 36, background: "rgba(0,0,0,0.2)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>⚠</div>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#fff", marginBottom: 6 }}>Entregas Prioritarias — Atención Inmediata Requerida</div>
          <div className="alert-dates-resp" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[[a.fecha1, a.desc1], [a.fecha2, a.desc2]].map(([fecha, desc], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ background: "rgba(0,0,0,0.25)", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 2 }}>{fecha}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <main className="main-resp" style={{ maxWidth: 1100, margin: "0 auto", padding: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 20, paddingBottom: 12, borderBottom: "2px solid #1a2744" }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#1a2744" }}>Comisiones de Trabajo</h2>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 11, color: "#6b6560", letterSpacing: 1 }}>{(data.comisiones || []).length} comisiones registradas</span>
        </div>

        {/* TOTAL PROGRESS */}
        {(() => {
          const allReqs = (data.comisiones || []).flatMap(c => c.requerimientos || []);
          const allTareas = (data.comisiones || []).flatMap(c => c.tareas || []);
          const totalReqs = allReqs.length;
          const doneReqs = allReqs.filter(r => r.done).length;
          const totalComisiones = (data.comisiones || []).length;
          const completeComisiones = (data.comisiones || []).filter(c => c.status === "complete").length;
          const pctReqs = totalReqs > 0 ? Math.round(doneReqs / totalReqs * 100) : 0;
          const pctComisiones = totalComisiones > 0 ? Math.round(completeComisiones / totalComisiones * 100) : 0;
          const pctTotal = Math.round((pctReqs + pctComisiones) / 2);
          return (
            <div style={{ background: "#fff", border: "1px solid #d8d4cc", borderRadius: 4, padding: "20px 28px", marginBottom: 28, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 180 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6b6560", marginBottom: 4 }}>Avance total del proyecto</div>
                <div style={{ height: 8, background: "#e0dbd2", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", background: pctTotal >= 80 ? "#1a5c38" : pctTotal >= 50 ? "#c47b1a" : "#9b2020", borderRadius: 4, width: `${pctTotal}%`, transition: "width .6s" }} />
                </div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#6b6560" }}>✓ <strong>{doneReqs}</strong>/{totalReqs} requerimientos listos</span>
                  <span style={{ fontSize: 12, color: "#6b6560" }}>✓ <strong>{completeComisiones}</strong>/{totalComisiones} comisiones completas</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <ArcGauge pct={pctReqs} size={90} color="#2c5f8a" />
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b6560", marginTop: 2 }}>Requerimientos</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <ArcGauge pct={pctComisiones} size={90} color="#c47b1a" />
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b6560", marginTop: 2 }}>Comisiones</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <ArcGauge pct={pctTotal} size={110} color={pctTotal >= 80 ? "#1a5c38" : pctTotal >= 50 ? "#c47b1a" : "#9b2020"} />
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b6560", marginTop: 2 }}>Total</div>
                </div>
              </div>
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "wrap" }}>
          {[["#1a5c38", "Completo"], ["#9b2020", "Falta personal"]].map(([color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6b6560" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{label}
            </div>
          ))}
        </div>

        {/* CARDS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(data.comisiones || []).map((c, i) => {
            const isOpen = openCards[i];
            const tab = activeTab[i] || 0;
            const reqs = c.requerimientos || [];
            const doneReqs = reqs.filter(r => r.done).length;
            const pct = reqs.length > 0 ? Math.round(doneReqs / reqs.length * 100) : 0;
            return (
              <div key={i} className="card-anim" style={{ background: "#fff", border: `1px solid ${isAdmin && adminMode ? "#c4b89a" : "#d8d4cc"}`, borderRadius: 4, overflow: "hidden", animationDelay: `${i * 0.05}s` }}>
                {/* Card header */}
                <div onClick={() => setOpenCards(o => ({ ...o, [i]: !o[i] }))} style={{ display: "flex", alignItems: "stretch", cursor: "pointer", userSelect: "none" }}>
                  <div style={{ width: 56, background: "#1a2744", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div style={{ flex: 1, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: "#1a2744", marginBottom: 3 }}>{c.titulo}</div>
                      <div style={{ fontSize: 12, color: "#6b6560" }}>Titular: <strong style={{ color: "#1a1a1a", fontWeight: 500 }}>{c.titular}</strong></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      {isAdmin && adminMode && (
                        <button onClick={e => { e.stopPropagation(); openPanel("comision", i); }}
                          style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", background: "transparent", border: "1px solid #d8d4cc", color: "#6b6560", padding: "4px 10px", cursor: "pointer", borderRadius: 2 }}>
                          ✎ Editar
                        </button>
                      )}
                      <ArcGauge pct={pct} size={52} color={pct >= 80 ? "#1a5c38" : pct >= 40 ? "#c47b1a" : "#9b2020"} bg="#e0dbd2" />
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, padding: "4px 12px", borderRadius: 2, background: c.status === "complete" ? "#edf7f1" : "#fdf0f0", color: c.status === "complete" ? "#1a5c38" : "#9b2020" }}>
                        {c.status === "complete" ? "Completo" : "Falta personal"}
                      </span>
                      <span style={{ fontSize: 11, color: isOpen ? "#fff" : "#6b6560", background: isOpen ? "#1a2744" : "transparent", border: "1px solid #d8d4cc", borderRadius: 3, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</span>
                    </div>
                  </div>
                </div>

                {/* Card body */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid #d8d4cc" }}>
                    {/* Tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid #d8d4cc", background: "#fafaf8" }}>
                      {["📋 Tareas", `📦 Requerimientos ${reqs.length > 0 ? `${doneReqs}/${reqs.length}` : ""}`].map((label, ti) => (
                        <button key={ti} onClick={() => setActiveTab(t => ({ ...t, [i]: ti }))}
                          style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", padding: "10px 20px", cursor: "pointer", color: tab === ti ? "#1a2744" : "#6b6560", borderBottom: tab === ti ? "2px solid #c47b1a" : "2px solid transparent", marginBottom: -1, background: "none", border: "none", borderBottom: tab === ti ? "2px solid #c47b1a" : "2px solid transparent", fontWeight: tab === ti ? 700 : 400 }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Tab 0: Tareas */}
                    {tab === 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: c.singleCol ? "1fr" : "1fr 1fr" }}>
                        <div style={{ padding: "20px 24px", borderRight: c.singleCol ? "none" : "1px solid #d8d4cc" }}>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6b6560", marginBottom: 10 }}>Tareas principales</div>
                          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                            {(c.tareas || []).map((t, ti) => (
                              <li key={ti} style={{ fontSize: 13, display: "flex", alignItems: "flex-start", gap: 9, lineHeight: 1.5 }}>
                                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#2c5f8a", flexShrink: 0, marginTop: 8, display: "block" }} />{t}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {[["Titular", c.titular], c.personal && ["Personal requerido", c.personal], c.apoyo && ["Personal de apoyo", c.apoyo], ["Entrega de requerimiento", c.entrega], ["Informe de avance", c.informe]].filter(Boolean).map(([k, v]) => (
                              <div key={k}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b6560", fontFamily: "'Syne',sans-serif" }}>{k}</div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: k.includes("Entrega") || k.includes("Informe") ? "#c47b1a" : "#1a1a1a" }}>{v}</div>
                              </div>
                            ))}
                            {c.alerta && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fdf0f0", border: "1px solid #f5c0c0", borderRadius: 3, padding: "8px 12px" }}>
                                <span style={{ fontSize: 12, color: "#9b2020" }}>⚠ {c.alerta}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 1: Requerimientos */}
                    {tab === 1 && (
                      <div style={{ padding: "20px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6b6560" }}>Lista de requerimientos</span>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span style={{ fontSize: 12, fontFamily: "'Syne',sans-serif", color: "#1a5c38" }}>✓ {doneReqs} listos</span>
                            <span style={{ fontSize: 12, fontFamily: "'Syne',sans-serif", color: "#9b2020" }}>○ {reqs.length - doneReqs} pendientes</span>
                          </div>
                        </div>
                        {reqs.length > 0 && (
                          <div style={{ height: 4, background: "#e0dbd2", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
                            <div style={{ height: "100%", background: "#1a5c38", borderRadius: 2, width: `${pct}%`, transition: "width .4s" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {reqs.length === 0
                            ? <div style={{ fontSize: 13, color: "#6b6560", fontStyle: "italic" }}>No hay requerimientos registrados.</div>
                            : reqs.map((r, ri) => (
                              <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: 3, border: `1px solid ${r.done ? "#a8d5b5" : "#c0cce8"}`, background: r.done ? "#e6f4ec" : "#f0f4ff", transition: "background .2s" }}>
                                <div onClick={() => toggleReq(i, ri)}
                                  style={{ width: 18, height: 18, border: `2px solid ${r.done ? "#1a5c38" : "#2c5f8a"}`, borderRadius: 3, flexShrink: 0, marginTop: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: r.done ? "#1a5c38" : "#fff", transition: "all .2s" }}>
                                  {r.done && <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: r.done ? "#6b6560" : "#1a1a1a", textDecoration: r.done ? "line-through" : "none" }}>{r.nombre}</div>
                                  {r.detalle && <div style={{ fontSize: 11, color: "#6b6560", marginTop: 2 }}>{r.detalle}</div>}
                                  {r.cantidad && <div style={{ fontSize: 11, color: "#6b6560", marginTop: 2 }}><strong>Cant:</strong> {r.cantidad}</div>}
                                </div>
                                {r.monto && <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, color: "#c47b1a", whiteSpace: "nowrap" }}>S/ {r.monto}</div>}
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ background: "#1a2744", color: "rgba(255,255,255,0.4)", marginTop: 48, position: "relative", overflow: "hidden" }}>
        <div className="cover-hover" style={{ width: "100%", height: 160, overflow: "hidden", position: "relative", background: "#0d1b35" }}>
          {data.images?.footer
            ? <img src={data.images.footer} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#0d1b35 0%,#1a2744 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.15)", textTransform: "uppercase" }}>📷 Imagen de pie de página</div>
          }
          {isAdmin && adminMode && (
            <label className="cover-overlay" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", opacity: 0, cursor: "pointer", transition: "opacity .2s" }}>
              <span style={{ background: "rgba(196,123,26,0.9)", border: "2px solid rgba(255,255,255,0.5)", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", padding: "10px 22px" }}>🖼 Cambiar imagen</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0], "footer")} />
            </label>
          )}
        </div>
        <div className="footer-resp" style={{ textAlign: "center", padding: "20px 48px", fontSize: 11, letterSpacing: 1, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <strong style={{ color: "rgba(255,255,255,0.7)" }}>{f.nombre}</strong> &nbsp;·&nbsp; {f.lugar} &nbsp;·&nbsp; {f.fecha} &nbsp;·&nbsp; {f.minuta}
        </div>
      </footer>

      {/* EDIT PANEL */}
      {panel && (
        <div onClick={e => e.target === e.currentTarget && closePanel()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div className="panel-resp" style={{ background: "#fff", width: 540, height: "100vh", overflowY: "auto", borderLeft: "3px solid #c47b1a", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#1a2744", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "#fff", fontWeight: 700 }}>
                {panel.type === "header" ? "Editar Encabezado" : panel.type === "images" ? "Editar Imágenes" : `Editar Comisión ${panel.index + 1}`}
              </h3>
              <button onClick={closePanel} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.7)", fontSize: 16, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: 24, flex: 1 }}>
              {/* PANEL HEADER */}
              {panel.type === "header" && (
                <>
                  <PanelSection title="Título del evento">
                    <Field label="Línea 1 del título" value={panelData.titulo1 || ""} onChange={v => setPanelData(d => ({ ...d, titulo1: v }))} />
                    <Field label="Línea 2 del título (color dorado)" value={panelData.titulo2 || ""} onChange={v => setPanelData(d => ({ ...d, titulo2: v }))} />
                    <Field label="Subtítulo" value={panelData.sub || ""} onChange={v => setPanelData(d => ({ ...d, sub: v }))} />
                    <Field label="Fecha en tag (ej: 09 Mayo 2026)" value={panelData.fechaEvento || ""} onChange={v => setPanelData(d => ({ ...d, fechaEvento: v }))} />
                    <Field label="Fecha ISO para contador (ej: 2026-05-09T10:00:00)" value={panelData.fechaISO || ""} onChange={v => setPanelData(d => ({ ...d, fechaISO: v }))} />
                    <Field label="Fecha completa" value={panelData.fecha || ""} onChange={v => setPanelData(d => ({ ...d, fecha: v }))} />
                    <Field label="Ubicación" value={panelData.ubicacion || ""} onChange={v => setPanelData(d => ({ ...d, ubicacion: v }))} />
                    <Field label="Estado general" value={panelData.estado || ""} onChange={v => setPanelData(d => ({ ...d, estado: v }))} />
                  </PanelSection>
                  <PanelSection title="Fechas prioritarias">
                    <Field label="Fecha 1" value={panelData.fecha1 || ""} onChange={v => setPanelData(d => ({ ...d, fecha1: v }))} />
                    <Field label="Descripción 1" value={panelData.desc1 || ""} onChange={v => setPanelData(d => ({ ...d, desc1: v }))} />
                    <Field label="Fecha 2" value={panelData.fecha2 || ""} onChange={v => setPanelData(d => ({ ...d, fecha2: v }))} />
                    <Field label="Descripción 2" value={panelData.desc2 || ""} onChange={v => setPanelData(d => ({ ...d, desc2: v }))} />
                  </PanelSection>
                  <PanelSection title="Pie de página">
                    <Field label="Nombre" value={panelData.fnombre || ""} onChange={v => setPanelData(d => ({ ...d, fnombre: v }))} />
                    <Field label="Lugar" value={panelData.flugar || ""} onChange={v => setPanelData(d => ({ ...d, flugar: v }))} />
                    <Field label="Fecha" value={panelData.ffecha || ""} onChange={v => setPanelData(d => ({ ...d, ffecha: v }))} />
                    <Field label="N° de Minuta" value={panelData.fminuta || ""} onChange={v => setPanelData(d => ({ ...d, fminuta: v }))} />
                  </PanelSection>
                </>
              )}

              {/* PANEL IMAGES */}
              {panel.type === "images" && (
                <>
                  <PanelSection title="Imagen de Portada (header)">
                    <label style={{ display: "block", border: "2px dashed #d8d4cc", borderRadius: 4, padding: 16, textAlign: "center", cursor: "pointer", background: "#fafaf8", position: "relative" }}>
                      {data.images?.cover && <img src={data.images.cover} style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 2, marginBottom: 8 }} />}
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b6560" }}>🖼 Haz clic para subir imagen</span>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0], "cover")} />
                    </label>
                    {data.images?.cover && <button onClick={() => update(ref(db, "chalaysanta/images"), { cover: "" })} style={{ marginTop: 8, padding: "4px 12px", background: "#fdf0f0", border: "1px solid #f5c0c0", color: "#9b2020", fontFamily: "'Syne',sans-serif", fontSize: 10, cursor: "pointer", borderRadius: 2 }}>✕ Quitar imagen</button>}
                  </PanelSection>
                  <PanelSection title="Imagen de Pie de Página">
                    <label style={{ display: "block", border: "2px dashed #d8d4cc", borderRadius: 4, padding: 16, textAlign: "center", cursor: "pointer", background: "#fafaf8", position: "relative" }}>
                      {data.images?.footer && <img src={data.images.footer} style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 2, marginBottom: 8 }} />}
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b6560" }}>🖼 Haz clic para subir imagen</span>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0], "footer")} />
                    </label>
                    {data.images?.footer && <button onClick={() => update(ref(db, "chalaysanta/images"), { footer: "" })} style={{ marginTop: 8, padding: "4px 12px", background: "#fdf0f0", border: "1px solid #f5c0c0", color: "#9b2020", fontFamily: "'Syne',sans-serif", fontSize: 10, cursor: "pointer", borderRadius: 2 }}>✕ Quitar imagen</button>}
                  </PanelSection>
                </>
              )}

              {/* PANEL COMISION */}
              {panel.type === "comision" && (
                <>
                  <PanelSection title="Datos principales">
                    <Field label="Nombre de la comisión" value={panelData.titulo || ""} onChange={v => setPanelData(d => ({ ...d, titulo: v }))} />
                    <Field label="Titular" value={panelData.titular || ""} onChange={v => setPanelData(d => ({ ...d, titular: v }))} />
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Estado</label>
                      <select value={panelData.status || "complete"} onChange={e => setPanelData(d => ({ ...d, status: e.target.value }))} style={inputStyle}>
                        <option value="complete">Completo</option>
                        <option value="missing">Falta personal</option>
                      </select>
                    </div>
                  </PanelSection>
                  <PanelSection title="Tareas (una por línea)">
                    <textarea value={panelData.tareasText || ""} onChange={e => setPanelData(d => ({ ...d, tareasText: e.target.value }))} style={{ ...inputStyle, minHeight: 110, resize: "vertical", lineHeight: 1.5 }} />
                  </PanelSection>
                  <PanelSection title="Personal">
                    <Field label="Personal requerido" value={panelData.personal || ""} onChange={v => setPanelData(d => ({ ...d, personal: v }))} />
                    <Field label="Personal de apoyo" value={panelData.apoyo || ""} onChange={v => setPanelData(d => ({ ...d, apoyo: v }))} />
                  </PanelSection>
                  <PanelSection title="Fechas">
                    <Field label="Entrega de requerimiento" value={panelData.entrega || ""} onChange={v => setPanelData(d => ({ ...d, entrega: v }))} />
                    <Field label="Informe de avance" value={panelData.informe || ""} onChange={v => setPanelData(d => ({ ...d, informe: v }))} />
                  </PanelSection>
                  <PanelSection title="Alerta (dejar vacío si no hay)">
                    <Field label="Mensaje de alerta" value={panelData.alerta || ""} onChange={v => setPanelData(d => ({ ...d, alerta: v }))} />
                  </PanelSection>
                  <PanelSection title="Requerimientos">
                    {(panelData.requerimientos || []).map((r, ri) => (
                      <div key={ri} style={{ border: "1px solid #d8d4cc", borderRadius: 3, padding: 12, background: "#fafaf8", marginBottom: 10, position: "relative" }}>
                        <button onClick={() => deleteReq(ri)} style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, background: "#fdf0f0", border: "1px solid #f5c0c0", color: "#9b2020", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2 }}>✕</button>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={r.nombre || ""} onChange={e => updateReq(ri, "nombre", e.target.value)} /></div>
                          <div><label style={labelStyle}>Cantidad</label><input style={inputStyle} value={r.cantidad || ""} onChange={e => updateReq(ri, "cantidad", e.target.value)} /></div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div><label style={labelStyle}>Detalle</label><input style={inputStyle} value={r.detalle || ""} onChange={e => updateReq(ri, "detalle", e.target.value)} /></div>
                          <div><label style={labelStyle}>Monto (S/)</label><input style={inputStyle} value={r.monto || ""} onChange={e => updateReq(ri, "monto", e.target.value)} /></div>
                        </div>
                      </div>
                    ))}
                    <button onClick={addReq} style={{ width: "100%", padding: 9, background: "transparent", border: "1px dashed #d8d4cc", color: "#6b6560", fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", borderRadius: 2 }}>+ Agregar requerimiento</button>
                  </PanelSection>
                </>
              )}
            </div>

            {savingMsg && <div style={{ fontSize: 12, color: "#1a5c38", padding: "8px 24px", background: "#edf7f1", borderTop: "1px solid #b8ddc9", textAlign: "center", fontFamily: "'Syne',sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>✓ Cambios guardados</div>}

            {panel.type !== "images" && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid #d8d4cc", display: "flex", gap: 10, position: "sticky", bottom: 0, background: "#fff" }}>
                <button onClick={closePanel} style={{ padding: "11px 20px", background: "transparent", color: "#6b6560", fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", border: "1px solid #d8d4cc", cursor: "pointer" }}>Cancelar</button>
                <button onClick={savePanel} style={{ flex: 1, padding: 11, background: "#1a2744", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", border: "none", cursor: "pointer", fontWeight: 700 }}>Guardar cambios</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── ARC GAUGE COMPONENT ──
function ArcGauge({ pct, size = 80, color = "#1a5c38", bg = "#e0dbd2", label = "" }) {
  const r = (size / 2) - 8;
  const cx = size / 2;
  const cy = size / 2;
  // Draw arc from 210deg to 330deg (240deg sweep) like speedometer
  const startAngle = 210;
  const sweep = 240;
  const endAngle = startAngle + sweep * (pct / 100);

  const toRad = deg => (deg * Math.PI) / 180;
  const arcPath = (start, end, radius) => {
    const s = { x: cx + radius * Math.cos(toRad(start)), y: cy + radius * Math.sin(toRad(start)) };
    const e = { x: cx + radius * Math.cos(toRad(end)), y: cy + radius * Math.sin(toRad(end)) };
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background arc */}
      <path d={arcPath(210, 210 + 240, r)} fill="none" stroke={bg} strokeWidth={6} strokeLinecap="round" />
      {/* Progress arc */}
      {pct > 0 && (
        <path d={arcPath(210, endAngle, r)} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
      )}
      {/* Percentage text */}
      <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: "'Syne',sans-serif", fontSize: size * 0.2, fontWeight: 800, fill: color }}>
        {pct}%
      </text>
      {label && (
        <text x={cx} y={cy + size * 0.22} textAnchor="middle"
          style={{ fontFamily: "'Syne',sans-serif", fontSize: size * 0.1, fill: "#6b6560" }}>
          {label}
        </text>
      )}
    </svg>
  );
}

// ── HELPER COMPONENTS ──
const labelStyle = { fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b6560", display: "block", marginBottom: 5 };
const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #d8d4cc", fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 13, color: "#1a1a1a", background: "#fafaf8", borderRadius: 2, boxSizing: "border-box" };
const adminBtn = { background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "5px 14px", cursor: "pointer" };

function PanelSection({ title, children }) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid #d8d4cc" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: "#2c5f8a", marginBottom: 16, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

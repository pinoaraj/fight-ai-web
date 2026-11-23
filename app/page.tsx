'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSession } from '@/components/SessionProvider';
import type { Report, Evidence, SessionRecord, FighterDescriptor, UserPreferences } from '@/lib/types';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const demo: Report = {
  mode: 'demo',
  provider: 'Sin proveedor',
  usedInReport: false,
  summary: 'Vista de demostración del formato de reporte. No corresponde a un análisis ejecutado por IA.',
  strengths: ['Presión con intención', 'Cambios de nivel para salir de la línea', 'Capacidad de llevar al rival hacia atrás'],
  priorities: ['Preparar mejor las entradas', 'Acercar los pies antes de comprometer el torso', 'Recuperar una base compacta después del cambio de nivel'],
  opponent: ['La mano adelantada gana valor cuando tiene espacio', 'Bajo presión tiende a elevar la guardia', 'La salida lateral debe cortarse en vez de perseguirse en línea'],
  plan: ['Finta → parry/slip → paso corto', 'Doble jab o jab al pecho → cuerpo → cabeza', 'Cerrar la salida lateral y terminar con pivote'],
  drills: ['Doble jab + cuerpo + pivote · 3×2 min', 'Parry/slip + respuesta de máximo 2 golpes + salida · 3×2 min', 'Cortar ring sin perseguir en línea · 3×2 min'],
  evidence: [
    { time: '00:34', title: 'Entrada desde distancia larga', observation: 'La línea central queda disponible mientras el rival puede usar su mano adelantada.', correction: 'Finta o defensa de jab antes de ganar el paso.' },
    { time: '00:52', title: 'Torso por delante de la base', observation: 'La intención de potencia aparece antes de que los pies terminen de cerrar distancia.', correction: 'Primero acercar la base; después lanzar desde una posición recuperable.' },
    { time: '01:17', title: 'Base muy abierta tras cambio de nivel', observation: 'La idea defensiva saca la cabeza de línea, pero la postura tarda en recuperarse.', correction: 'Recoger los pies y salir por ángulo inmediatamente.' },
  ],
};

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(ts: number, lang: 'es' | 'en') {
  const date = new Date(ts);
  if (lang === 'es') {
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getVideoThumbnail(video: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(video);
    const videoEl = document.createElement('video');
    videoEl.src = url;
    videoEl.currentTime = 1;
    videoEl.onloadeddata = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, 160, 90);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } else {
        resolve('');
      }
      URL.revokeObjectURL(url);
    };
    videoEl.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('');
    };
  });
}

export default function Home() {
  const {
    sessions,
    currentSessionId,
    preferences,
    addSession,
    loadSession,
    removeSession,
    clearCurrentSession,
    setPreference,
  } = useSession();

  const [video, setVideo] = useState<File | null>(null);
  const [fighter, setFighter] = useState<'Guantes rojos' | 'Guantes azules' | 'Otro'>('Guantes rojos');
  const [sport, setSport] = useState<'boxing' | 'kickboxing'>('boxing');
  const [stance, setStance] = useState<'orthodox' | 'southpaw' | 'switch'>('orthodox');
  const [report, setReport] = useState<Report | null>(null);
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [reviewFocus, setReviewFocus] = useState('full');
  const [intensity, setIntensity] = useState('moderate');
  const [activeTab, setActiveTab] = useState<'home' | 'sessions' | 'analyze' | 'progress' | 'profile'>('analyze');
  const [processingStep, setProcessingStep] = useState(0);
  const [fighterAnchor, setFighterAnchor] = useState<{x:number;y:number}|null>(null);
  const [fighterDescription, setFighterDescription] = useState('');
  const [fighterTopColor, setFighterTopColor] = useState('');
  const [fighterRelativeHeight, setFighterRelativeHeight] = useState<'shorter' | 'similar' | 'taller'>('similar');
  const [fighterBuild, setFighterBuild] = useState<'lean' | 'average' | 'stocky'>('average');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useMemo(() => (video ? URL.createObjectURL(video) : ''), [video]);

  // Sync with preferences on mount
  useEffect(() => {
    if (preferences) {
      setLanguage(preferences.language);
      setSport(preferences.sport);
      setStance(preferences.stance);
      setReviewFocus(preferences.review_focus);
      setIntensity(preferences.intensity);
    }
  }, [preferences]);

  // Sync preferences when they change
  const updatePreference = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreference(key, value);
    // Also update local state for immediate feedback
    if (key === 'language') setLanguage(value as 'es' | 'en');
    else if (key === 'sport') setSport(value as 'boxing' | 'kickboxing');
    else if (key === 'stance') setStance(value as 'orthodox' | 'southpaw' | 'switch');
    else if (key === 'review_focus') setReviewFocus(value as string);
    else if (key === 'intensity') setIntensity(value as string);
  }, [setPreference]);

  useEffect(() => {
    if (!busy) { setProcessingStep(0); return; }
    const id = setInterval(() => setProcessingStep(v => Math.min(4, v + 1)), 3200);
    return () => clearInterval(id);
  }, [busy]);

  async function uploadLargeVideo(file: File) {
    const init = await fetch('/api/uploads/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type || 'video/mp4', size: file.size }),
    });
    const initData = await init.json() as { uploadId?: string; chunkSize?: number; error?: string };
    if (!init.ok || !initData.uploadId || !initData.chunkSize) throw new Error(initData.error || 'No se pudo iniciar la carga del video.');

    const chunkSize = initData.chunkSize;
    let offset = 0;
    while (offset < file.size) {
      const next = Math.min(file.size, offset + chunkSize);
      const chunk = file.slice(offset, next);
      const response = await fetch(`/api/uploads/${encodeURIComponent(initData.uploadId)}/chunk?offset=${offset}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Falló un fragmento del video.');
      offset = next;
      setUploadProgress(Math.round((offset / file.size) * 100));
    }
    return initData.uploadId;
  }

  async function analyze() {
    if (!video) return setError('Selecciona un video antes de analizar.');
    setBusy(true); setError(''); setReport(null);
    try {
      setUploadProgress(0);
      const common = {
        language,
        review_focus: reviewFocus,
        intensity,
        fighter_description: fighterDescription,
        fighter_anchor_x: fighterAnchor ? fighterAnchor.x.toFixed(4) : '',
        fighter_anchor_y: fighterAnchor ? fighterAnchor.y.toFixed(4) : '',
        sport,
        stance,
        athlete_marker: fighter === 'Guantes rojos' ? 'red_gloves' : fighter === 'Guantes azules' ? 'blue_gloves' : 'visual_reid',
        glove_color: fighter === 'Guantes rojos' ? 'red' : fighter === 'Guantes azules' ? 'blue' : '',
        top_color: fighterTopColor,
        relative_height: fighterRelativeHeight,
        build: fighterBuild,
      };

      let response: Response;
      const useChunkedUpload = video.size >= 12 * 1024 * 1024;
      if (useChunkedUpload) {
        const uploadId = await uploadLargeVideo(video);
        response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...common, uploadId }),
        });
      } else {
        const body = new FormData();
        body.append('video', video);
        Object.entries(common).forEach(([key, value]) => body.append(key, value));
        response = await fetch('/api/analyze', { method: 'POST', body });
      }
      const raw = await response.text();
      let data: Report | { error?: string } | null = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

      if (!response.ok) {
        const serverMessage = data && 'error' in data && typeof data.error === 'string' ? data.error : '';
        const contentType = response.headers.get('content-type') || '';
        const upstreamHtml = contentType.includes('text/html') || raw.trim().startsWith('<');
        if (serverMessage) throw new Error(serverMessage);
        if (upstreamHtml) throw new Error(`El servidor interrumpió el análisis (HTTP ${response.status}). El video pudo exceder el tiempo o recursos disponibles. Fight AI registró este fallo para corrección.`);
        throw new Error(`No se pudo ejecutar el análisis (HTTP ${response.status}).`);
      }

      if (!data || !('summary' in data) || typeof data.summary !== 'string') {
        throw new Error('El servidor respondió sin un reporte válido.');
      }

      // Create session record
      const thumbnail = await getVideoThumbnail(video);
      const sessionRecord: SessionRecord = {
        id: generateId(),
        createdAt: Date.now(),
        video: { name: video.name, size: video.size, type: video.type || 'video/mp4' },
        input: {
          language,
          review_focus: reviewFocus,
          intensity,
          sport,
          stance,
          athlete_marker: fighter === 'Guantes rojos' ? 'red_gloves' : fighter === 'Guantes azules' ? 'blue_gloves' : 'visual_reid',
          glove_color: fighter === 'Guantes rojos' ? 'red' : fighter === 'Guantes azules' ? 'blue' : '',
          top_color: fighterTopColor,
          relative_height: fighterRelativeHeight,
          build: fighterBuild,
          fighter_description: fighterDescription,
          fighter_anchor_x: fighterAnchor ? fighterAnchor.x.toFixed(4) : '',
          fighter_anchor_y: fighterAnchor ? fighterAnchor.y.toFixed(4) : '',
          fighterDescriptor: {
            preset: fighter === 'Guantes rojos' ? 'red_gloves' : fighter === 'Guantes azules' ? 'blue_gloves' : undefined,
            glove_color: fighter === 'Guantes rojos' ? 'red' : fighter === 'Guantes azules' ? 'blue' : '',
            top_color: fighterTopColor,
            relative_height: fighterRelativeHeight,
            build: fighterBuild,
            stance,
            anchor_x: fighterAnchor?.x,
            anchor_y: fighterAnchor?.y,
            description: fighterDescription,
          },
        },
        report: data,
        status: 'completed',
      };

      addSession(sessionRecord);
      setReport(data);
      setActiveTab('sessions');
    } catch (e) {
      // Save failed session for history
      const sessionRecord: SessionRecord = {
        id: generateId(),
        createdAt: Date.now(),
        video: { name: video.name, size: video.size, type: video.type || 'video/mp4' },
        input: {
          language,
          review_focus: reviewFocus,
          intensity,
          sport,
          stance,
          athlete_marker: fighter === 'Guantes rojos' ? 'red_gloves' : fighter === 'Guantes azules' ? 'blue_gloves' : 'visual_reid',
          glove_color: fighter === 'Guantes rojos' ? 'red' : fighter === 'Guantes azules' ? 'blue' : '',
          top_color: fighterTopColor,
          relative_height: fighterRelativeHeight,
          build: fighterBuild,
          fighter_description: fighterDescription,
          fighter_anchor_x: fighterAnchor ? fighterAnchor.x.toFixed(4) : '',
          fighter_anchor_y: fighterAnchor ? fighterAnchor.y.toFixed(4) : '',
          fighterDescriptor: {
            preset: fighter === 'Guantes rojos' ? 'red_gloves' : fighter === 'Guantes azules' ? 'blue_gloves' : undefined,
            glove_color: fighter === 'Guantes rojos' ? 'red' : fighter === 'Guantes azules' ? 'blue' : '',
            top_color: fighterTopColor,
            relative_height: fighterRelativeHeight,
            build: fighterBuild,
            stance,
            anchor_x: fighterAnchor?.x,
            anchor_y: fighterAnchor?.y,
            description: fighterDescription,
          },
        },
        report: null,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Error inesperado.',
      };
      addSession(sessionRecord);
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally { setBusy(false); setUploadProgress(0); }
  }

  function jump(time: string) {
    const node = videoRef.current;
    if (!node) return;
    const [m, s] = time.split(':').map(Number);
    node.currentTime = m * 60 + s;
    node.play().catch(() => undefined);
  }

  const currentSession = currentSessionId ? sessions.find(s => s.id === currentSessionId) : null;
  const displayReport = report || currentSession?.report;
  const displayFighter = fighter;

  // Progress aggregation
  const completedSessions = sessions.filter(s => s.status === 'completed' && s.report);
  const totalRounds = completedSessions.length;
  const allPriorities = completedSessions.flatMap(s => s.report?.priorities || []);
  const allStrengths = completedSessions.flatMap(s => s.report?.strengths || []);
  const priorityCounts = allPriorities.reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc; }, {} as Record<string, number>);
  const topPriorities = Object.entries(priorityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text]) => text);

  const renderSessionsTab = () => (
    <section className="mobileMirrorPanel panel">
      <span className="eyebrow">SESIONES</span>
      <h2>{language === 'es' ? 'Historial de análisis' : 'Analysis History'}</h2>
      {sessions.length === 0 ? (
        <div className="empty">
          <p>{language === 'es' ? 'No hay sesiones guardadas. Analiza tu primer sparring.' : 'No sessions saved. Analyze your first sparring.'}</p>
          <button className="primary" onClick={() => setActiveTab('analyze')}>{language === 'es' ? 'ANALIZAR SPARRING' : 'ANALYZE SPARRING'}</button>
        </div>
      ) : (
        <div className="sessionList">
          {sessions.map(session => (
            <button
              key={session.id}
              className={`sessionCard ${currentSessionId === session.id ? 'active' : ''}`}
              onClick={() => loadSession(session.id)}
            >
              <div className="sessionThumb">
                {session.input.fighterDescriptor.preset === 'red_gloves' ? (
                  <span className="gloveBadge red">R</span>
                ) : session.input.fighterDescriptor.preset === 'blue_gloves' ? (
                  <span className="gloveBadge blue">B</span>
                ) : (
                  <span className="gloveBadge custom">✎</span>
                )}
                {session.video && session.video.name && session.report && (
                  <img src={session.video.name} alt="" style={{display: 'none'}} />
                )}
              </div>
              <div className="sessionInfo">
                <div className="sessionMeta">
                  <span className="sessionDate">{formatDate(session.createdAt, language)}</span>
                  <span className="sessionStatus {session.status}">{session.status === 'completed' ? (language === 'es' ? 'Completado' : 'Completed') : (language === 'es' ? 'Fallido' : 'Failed')}</span>
                </div>
                <div className="sessionDetails">
                  <span>{session.input.sport === 'boxing' ? '🥊' : '🦵'} {session.input.sport === 'boxing' ? 'Boxeo' : 'Kickboxing'}</span>
                  <span>·</span>
                  <span>{session.input.stance === 'orthodox' ? 'Ortodoxa' : session.input.stance === 'southpaw' ? 'Zurda' : 'Switch'}</span>
                  {session.report && <span>·</span>}
                  {session.report && <span>{session.report.provider}</span>}
                </div>
                {session.error && <div className="sessionError">{session.error}</div>}
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end'}}>
                <button
                  className="deleteBtn"
                  onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
                  aria-label={language === 'es' ? 'Eliminar sesión' : 'Delete session'}
                >
                  ✕
                </button>
                {session.report && (
                  <button
                    className="exportBtn"
                    style={{fontSize: '10px', padding: '4px 8px', background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '6px', cursor: 'pointer'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      const report = session.report!;
                      generatePDF(report, session.input.fighterDescriptor.preset === 'red_gloves' ? 'Guantes rojos' : session.input.fighterDescriptor.preset === 'blue_gloves' ? 'Guantes azules' : 'Peleador', session.input.language || language, preferences).save(`fight-ai-${session.id}.pdf`);
                    }}
                  >
                    {language === 'es' ? 'PDF' : 'PDF'}
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderProgressTab = () => {
    // Enhanced analytics
    const totalSessions = completedSessions.length;
    const totalEvidence = completedSessions.flatMap(s => s.report?.evidence || []).length;
    const totalPlanItems = completedSessions.flatMap(s => s.report?.plan || []).length;
    const totalDrills = completedSessions.flatMap(s => s.report?.drills || []).length;

    // Strength frequency
    const strengthCounts = allStrengths.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<string, number>);
    const topStrengths = Object.entries(strengthCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Priority frequency with counts
    const priorityCounts = allPriorities.reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc; }, {} as Record<string, number>);
    const topPrioritiesWithCount = Object.entries(priorityCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);

    // Opponent patterns
    const allOpponent = completedSessions.flatMap(s => s.report?.opponent || []);
    const opponentCounts = allOpponent.reduce((acc, o) => { acc[o] = (acc[o] || 1) + 1; return acc; }, {} as Record<string, number>);
    const topOpponent = Object.entries(opponentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Sport breakdown
    const sportCounts = completedSessions.reduce((acc, s) => { acc[s.input.sport] = (acc[s.input.sport] || 0) + 1; return acc; }, {} as Record<string, number>);
    const stanceCounts = completedSessions.reduce((acc, s) => { acc[s.input.stance] = (acc[s.input.stance] || 0) + 1; return acc; }, {} as Record<string, number>);

    // Recent trend (last 5 sessions)
    const recentSessions = completedSessions.slice(0, 5);
    const recentPriorities = recentSessions.flatMap(s => s.report?.priorities || []);
    const recentPriorityCounts = recentPriorities.reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc; }, {} as Record<string, number>);
    const recentTopPriorities = Object.entries(recentPriorityCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return (
      <section className="mobileMirrorPanel panel">
        <span className="eyebrow">PROGRESO</span>
        <h2>{language === 'es' ? 'Progreso de entrenamiento' : 'Training Progress'}</h2>
        {completedSessions.length === 0 ? (
          <div className="empty">
            <p>{language === 'es' ? 'Completa al menos un análisis para ver tu progreso.' : 'Complete at least one analysis to see progress.'}</p>
            <button className="primary" onClick={() => setActiveTab('analyze')}>{language === 'es' ? 'ANALIZAR SPARRING' : 'ANALYZE SPARRING'}</button>
          </div>
        ) : (
          <div className="progressGrid">
            {/* Overview Stats */}
            <div className="statCard">
              <b>{totalSessions}</b>
              <span>{language === 'es' ? 'Sesiones completadas' : 'Completed sessions'}</span>
            </div>
            <div className="statCard">
              <b>{totalEvidence}</b>
              <span>{language === 'es' ? 'Evidencias registradas' : 'Evidence items logged'}</span>
            </div>
            <div className="statCard">
              <b>{totalPlanItems}</b>
              <span>{language === 'es' ? 'Acciones del plan táctico' : 'Tactical plan items'}</span>
            </div>
            <div className="statCard">
              <b>{totalDrills}</b>
              <span>{language === 'es' ? 'Drills asignados' : 'Drills assigned'}</span>
            </div>

            {/* Sport & Stance Breakdown */}
            <div className="breakdownCard" style={{gridColumn: '1 / -1'}}>
              <h3>{language === 'es' ? 'Disciplina y guardia' : 'Discipline & Stance'}</h3>
              <div style={{display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--muted)'}}>
                {Object.entries(sportCounts).map(([sport, count]) => (
                  <span key={sport}>{sport === 'boxing' ? '🥊' : '🦵'} {sport === 'boxing' ? 'Boxeo' : 'Kickboxing'}: <b>{count}</b></span>
                ))}
                {Object.entries(stanceCounts).map(([stance, count]) => (
                  <span key={stance}>{stance === 'orthodox' ? '⟲' : stance === 'southpaw' ? '⟳' : '⇄'} {stance === 'orthodox' ? 'Ortodoxa' : stance === 'southpaw' ? 'Zurda' : 'Switch'}: <b>{count}</b></span>
                ))}
              </div>
            </div>

            {/* Top Strengths */}
            {topStrengths.length > 0 && (
              <div className="patternCard" style={{gridColumn: '1 / -1'}}>
                <h3>{language === 'es' ? 'Fortalezas más frecuentes' : 'Most Frequent Strengths'}</h3>
                <ul>
                  {topStrengths.map(([text, count], i) => (
                    <li key={text}><b>0{i+1}</b> {text} <span style={{color: 'var(--muted)', fontWeight: '400'}}>({count}x)</span></li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top Priorities with counts */}
            {topPrioritiesWithCount.length > 0 && (
              <div className="patternCard" style={{gridColumn: '1 / -1'}}>
                <h3>{language === 'es' ? 'Prioridades recurrentes' : 'Recurring Priorities'}</h3>
                <ul>
                  {topPrioritiesWithCount.map(([text, count], i) => (
                    <li key={text}><b>0{i+1}</b> {text} <span style={{color: 'var(--muted)', fontWeight: '400'}}>({count}x)</span></li>
                  ))}
                </ul>
              </div>
            )}

            {/* Opponent Patterns */}
            {topOpponent.length > 0 && (
              <div className="patternCard" style={{gridColumn: '1 / -1'}}>
                <h3>{language === 'es' ? 'Patrones de rival detectados' : 'Opponent Patterns Detected'}</h3>
                <ul>
                  {topOpponent.map(([text, count], i) => (
                    <li key={text}><b>0{i+1}</b> {text} <span style={{color: 'var(--muted)', fontWeight: '400'}}>({count}x)</span></li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recent Trend */}
            {recentTopPriorities.length > 0 && (
              <div className="patternCard" style={{gridColumn: '1 / -1', borderLeft: '3px solid var(--accent)'}}>
                <h3>{language === 'es' ? 'Tendencia reciente (últimas 5 sesiones)' : 'Recent Trend (last 5 sessions)'}</h3>
                <ul>
                  {recentTopPriorities.map(([text, count], i) => (
                    <li key={text}><b>0{i+1}</b> {text} <span style={{color: 'var(--muted)', fontWeight: '400'}}>({count}x)</span></li>
                  ))}
                </ul>
                <p style={{fontSize: '12px', color: 'var(--muted)', marginTop: '8px'}}>{language === 'es' ? 'Enfoca tus próximos drills en estos patrones actuales.' : 'Focus upcoming drills on these current patterns.'}</p>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  const renderProfileTab = () => (
    <section className="mobileMirrorPanel panel">
      <span className="eyebrow">PERFIL</span>
      <h2>{language === 'es' ? 'Perfil y Preferencias' : 'Profile & Preferences'}</h2>
      <div className="preferenceGrid">
        <label>
          <span>{language === 'es' ? 'Nombre' : 'Name'}</span>
          <input
            value={preferences.userName}
            onChange={e => updatePreference('userName', e.target.value)}
            placeholder={language === 'es' ? 'Tu nombre' : 'Your name'}
          />
        </label>
        <label>
          <span>{language === 'es' ? 'Categoría de peso' : 'Weight Class'}</span>
          <input
            value={preferences.weightClass}
            onChange={e => updatePreference('weightClass', e.target.value)}
            placeholder={language === 'es' ? 'Ej: 75kg, Welter, Middleweight' : 'Ex: 75kg, Welter, Middleweight'}
          />
        </label>
        <label>
          <span>{language === 'es' ? 'Nivel de experiencia' : 'Experience Level'}</span>
          <select value={preferences.experienceLevel} onChange={e => updatePreference('experienceLevel', e.target.value as UserPreferences['experienceLevel'])}>
            <option value="beginner">{language === 'es' ? 'Principiante' : 'Beginner'}</option>
            <option value="intermediate">{language === 'es' ? 'Intermedio' : 'Intermediate'}</option>
            <option value="advanced">{language === 'es' ? 'Avanzado' : 'Advanced'}</option>
            <option value="pro">{language === 'es' ? 'Profesional' : 'Pro'}</option>
          </select>
        </label>
        <label>
          <span>{language === 'es' ? 'Objetivo principal' : 'Primary Goal'}</span>
          <select value={preferences.primaryGoal} onChange={e => updatePreference('primaryGoal', e.target.value as UserPreferences['primaryGoal'])}>
            <option value="technique">{language === 'es' ? 'Técnica' : 'Technique'}</option>
            <option value="fitness">{language === 'es' ? 'Acondicionamiento' : 'Fitness'}</option>
            <option value="competition">{language === 'es' ? 'Competición' : 'Competition'}</option>
            <option value="self_defense">{language === 'es' ? 'Autodefensa' : 'Self Defense'}</option>
          </select>
        </label>
        <label>
          <span>{language === 'es' ? 'Frecuencia de entrenamiento' : 'Training Frequency'}</span>
          <select value={preferences.trainingFrequency} onChange={e => updatePreference('trainingFrequency', e.target.value as UserPreferences['trainingFrequency'])}>
            <option value="1-2">{language === 'es' ? '1-2 días/semana' : '1-2 days/week'}</option>
            <option value="3-4">{language === 'es' ? '3-4 días/semana' : '3-4 days/week'}</option>
            <option value="5+">{language === 'es' ? '5+ días/semana' : '5+ days/week'}</option>
            <option value="irregular">{language === 'es' ? 'Irregular' : 'Irregular'}</option>
          </select>
        </label>
        <label>
          <span>{language === 'es' ? 'Estilo de coaching preferido' : 'Preferred Coach Style'}</span>
          <select value={preferences.preferredCoachStyle} onChange={e => updatePreference('preferredCoachStyle', e.target.value as UserPreferences['preferredCoachStyle'])}>
            <option value="analytical">{language === 'es' ? 'Analítico' : 'Analytical'}</option>
            <option value="motivational">{language === 'es' ? 'Motivacional' : 'Motivational'}</option>
            <option value="direct">{language === 'es' ? 'Directo' : 'Direct'}</option>
            <option value="balanced">{language === 'es' ? 'Equilibrado' : 'Balanced'}</option>
          </select>
        </label>
        <hr style={{border: 'none', borderTop: '1px solid var(--line)', margin: '12px 0'}} />
        <label>
          <span>{language === 'es' ? 'Idioma por defecto' : 'Default Language'}</span>
          <div className="fighters compact">
            <button className={language === 'es' ? 'active' : ''} onClick={() => updatePreference('language', 'es')}>ES</button>
            <button className={language === 'en' ? 'active' : ''} onClick={() => updatePreference('language', 'en')}>EN</button>
          </div>
        </label>
        <label>
          <span>{language === 'es' ? 'Disciplina por defecto' : 'Default Sport'}</span>
          <select value={sport} onChange={e => updatePreference('sport', e.target.value as 'boxing' | 'kickboxing')}>
            <option value="boxing">Boxeo</option>
            <option value="kickboxing">Kickboxing</option>
          </select>
        </label>
        <label>
          <span>{language === 'es' ? 'Guardia por defecto' : 'Default Stance'}</span>
          <select value={stance} onChange={e => updatePreference('stance', e.target.value as 'orthodox' | 'southpaw' | 'switch')}>
            <option value="orthodox">Ortodoxa</option>
            <option value="southpaw">Zurda</option>
            <option value="switch">Switch</option>
          </select>
        </label>
        <label>
          <span>{language === 'es' ? 'Foco de revisión' : 'Review Focus'}</span>
          <div className="fighters compact">
            {[['full', language === 'es' ? 'Completo' : 'Full'], ['offense', language === 'es' ? 'Ataque' : 'Offense'], ['defense', language === 'es' ? 'Defensa' : 'Defense'], ['footwork', 'Footwork'], ['strategy', language === 'es' ? 'Estrategia' : 'Strategy']].map(([id, label]) => (
              <button key={id} className={reviewFocus === id ? 'active' : ''} onClick={() => updatePreference('review_focus', id)}>{label}</button>
            ))}
          </div>
        </label>
        <label>
          <span>{language === 'es' ? 'Intensidad' : 'Intensity'}</span>
          <div className="fighters compact">
            {[['technical', language === 'es' ? 'Técnico' : 'Technical'], ['light', language === 'es' ? 'Suave' : 'Light'], ['moderate', language === 'es' ? 'Moderado' : 'Moderate'], ['hard', language === 'es' ? 'Fuerte' : 'Hard']].map(([id, label]) => (
              <button key={id} className={intensity === id ? 'active' : ''} onClick={() => updatePreference('intensity', id)}>{label}</button>
            ))}
          </div>
        </label>
        <hr style={{border: 'none', borderTop: '1px solid var(--line)', margin: '12px 0'}} />
        <label>
          <span>{language === 'es' ? 'Notificaciones' : 'Notifications'}</span>
          <div className="fighters compact">
            <button className={preferences.notificationsEnabled ? 'active' : ''} onClick={() => updatePreference('notificationsEnabled', true)}>{language === 'es' ? 'Activadas' : 'Enabled'}</button>
            <button className={!preferences.notificationsEnabled ? 'active' : ''} onClick={() => updatePreference('notificationsEnabled', false)}>{language === 'es' ? 'Desactivadas' : 'Disabled'}</button>
          </div>
        </label>
        <label>
          <span>{language === 'es' ? 'Guardado automático de reportes' : 'Auto-save Reports'}</span>
          <div className="fighters compact">
            <button className={preferences.autoSaveReports ? 'active' : ''} onClick={() => updatePreference('autoSaveReports', true)}>{language === 'es' ? 'Sí' : 'Yes'}</button>
            <button className={!preferences.autoSaveReports ? 'active' : ''} onClick={() => updatePreference('autoSaveReports', false)}>{language === 'es' ? 'No' : 'No'}</button>
          </div>
        </label>
        <label>
          <span>{language === 'es' ? 'Consentimiento para compartir datos anónimos' : 'Anonymous Data Sharing Consent'}</span>
          <div className="fighters compact">
            <button className={preferences.dataSharingConsent ? 'active' : ''} onClick={() => updatePreference('dataSharingConsent', true)}>{language === 'es' ? 'Acepto' : 'Accept'}</button>
            <button className={!preferences.dataSharingConsent ? 'active' : ''} onClick={() => updatePreference('dataSharingConsent', false)}>{language === 'es' ? 'Rechazo' : 'Decline'}</button>
          </div>
        </label>
      </div>
      <div className="profileActions">
        <button className="secondary" onClick={() => { sessions.forEach(s => removeSession(s.id)); setActiveTab('analyze'); }}>
          {language === 'es' ? 'Limpiar historial' : 'Clear History'}
        </button>
      </div>
    </section>
  );

  return (
    <main>
      <header className="topbar">
        <div className="mobileSafeBar" />
        <div className="brand"><span className="mark">FA</span><div><b>FIGHT AI</b><small>SPARRING ANALYST</small></div></div>
        <div className="headerRight"><div className="status"><span className="dot"/> MOTOR LISTO · IA SEGÚN REPORTE</div><div className="langToggle"><button className={language === 'es' ? 'active' : ''} onClick={() => updatePreference('language', 'es')}>ES</button><button className={language === 'en' ? 'active' : ''} onClick={() => updatePreference('language', 'en')}>EN</button></div></div>
      </header>

      <nav className="desktopNav">
        {[
          ['home','⌂','Inicio'],['sessions','◷','Sesiones'],['analyze','＋','Analizar'],['progress','↗','Progreso'],['profile','◎','Perfil']
        ].map(([id,icon,label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id as typeof activeTab)}><span>{icon}</span>{label}</button>)}
      </nav>

      {activeTab === 'home' && (
        <section className="hero">
          <div>
            <span className="eyebrow">BOXING · KICKBOXING · STRIKING</span>
            <h1>Convierte tu sparring en<br/><em>decisiones entrenables.</em></h1>
            <p>Sube un round, identifica al peleador y recibe correcciones, estrategia, drills y evidencia reproducible por timestamp.</p>
          </div>
          <div className="heroCard"><b>PRINCIPIO DEL PRODUCTO</b><span>Menos métricas inventadas.<br/>Más evidencia visible y acciones concretas.</span></div>
          <button className="primary" onClick={() => setActiveTab('analyze')}>{language === 'es' ? 'ANALIZAR SPARRING' : 'ANALYZE SPARRING'}</button>
        </section>
      )}

      {activeTab === 'sessions' && renderSessionsTab()}
      {activeTab === 'progress' && renderProgressTab()}
      {activeTab === 'profile' && renderProfileTab()}

      {activeTab === 'analyze' && (
        <section className="workspace">
          <div className="panel uploadPanel">
            <div className="sectionTitle"><span>01</span><div><b>VIDEO</b><small>Selecciona el sparring</small></div></div>
            <input ref={inputRef} hidden type="file" accept="video/*" onChange={e => { setVideo(e.target.files?.[0] || null); setReport(null); clearCurrentSession(); }} />
            {!video ? (
              <button className="drop" onClick={() => inputRef.current?.click()}><strong>SUBIR VIDEO</strong><span>MP4, MOV o archivo compatible del navegador</span></button>
            ) : (
              <div className="videoWrap"><div className="videoStage" onClick={e => {
                if (fighter !== 'Otro') return;
                const r = e.currentTarget.getBoundingClientRect();
                setFighterAnchor({x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
              }}><video ref={videoRef} src={videoUrl} controls playsInline/>{fighter === 'Otro' && <div className="anchorHint">{fighterAnchor ? '✓ PELEADOR MARCADO' : 'TOCA AL PELEADOR EN EL VIDEO'}</div>}{fighterAnchor && <span className="fighterAnchor" style={{left:(fighterAnchor.x*100)+'%',top:(fighterAnchor.y*100)+'%'}}/>}</div><div className="fileRow"><span>{video.name}</span><button onClick={() => inputRef.current?.click()}>Cambiar</button></div></div>
            )}

            <div className="sectionTitle fighterTitle"><span>02</span><div><b>PELEADOR OBJETIVO</b><small>La identidad se mantiene durante el análisis</small></div></div>
            <div className="fighters">
              {['Guantes rojos','Guantes azules','Otro'].map(x => <button key={x} className={fighter === x ? 'active' : ''} onClick={() => { setFighter(x as 'Guantes rojos' | 'Guantes azules' | 'Otro'); if (x !== 'Otro') setFighterAnchor(null); }}>{x}</button>)}
            </div>
            {fighter === 'Otro' && <div className="fighterReid"><p>{language === 'es' ? 'Pausa el video y toca al peleador para crear un ancla visual. Agrega una descripción para reforzar la re-identificación.' : 'Pause the video and tap the fighter to create a visual anchor. Add a description to reinforce re-identification.'}</p><input value={fighterDescription} onChange={e => setFighterDescription(e.target.value)} placeholder={language === 'es' ? 'Ej: polera negra, más bajo, ortodoxo' : 'Ex: black shirt, shorter, orthodox'}/></div>}
            {fighter !== 'Otro' && (
              <div className="fighterReid" style={{marginTop: '10px'}}>
                <p style={{fontSize: '11px', lineHeight: '1.5', color: 'var(--muted)', margin: '0 0 9px'}}>{language === 'es' ? 'Descriptores visuales opcionales para reforzar la re-identificación del peleador.' : 'Optional visual descriptors to reinforce fighter re-identification.'}</p>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                  <div>
                    <label style={{display: 'flex', flexDirection: 'column', gap: '7px', color: 'var(--muted)', fontSize: '10px', fontWeight: '700', letterSpacing: '.05em'}}>
                      {language === 'es' ? 'Color de polera' : 'Shirt color'}
                      <input value={fighterTopColor} onChange={e => setFighterTopColor(e.target.value)} placeholder={language === 'es' ? 'Ej: negro, blanco, azul' : 'Ex: black, white, blue'} style={{width: '100%', appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '11px 12px', borderRadius: '11px', fontSize: '12px'}} />
                    </label>
                  </div>
                  <div>
                    <label style={{display: 'flex', flexDirection: 'column', gap: '7px', color: 'var(--muted)', fontSize: '10px', fontWeight: '700', letterSpacing: '.05em'}}>
                      {language === 'es' ? 'Altura relativa' : 'Relative height'}
                      <select value={fighterRelativeHeight} onChange={e => setFighterRelativeHeight(e.target.value as 'shorter' | 'similar' | 'taller')} style={{width: '100%', appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '11px 34px 11px 12px', borderRadius: '11px', fontSize: '12px', backgroundImage: 'linear-gradient(45deg,transparent 50%,#7e8995 50%),linear-gradient(135deg,#7e8995 50%,transparent 50%)', backgroundPosition: 'calc(100% - 16px) 50%,calc(100% - 11px) 50%', backgroundSize: '5px 5px,5px 5px', backgroundRepeat: 'no-repeat'}}>
                        <option value="shorter">{language === 'es' ? 'Más bajo' : 'Shorter'}</option>
                        <option value="similar">{language === 'es' ? 'Similar' : 'Similar'}</option>
                        <option value="taller">{language === 'es' ? 'Más alto' : 'Taller'}</option>
                      </select>
                    </label>
                  </div>
                  <div>
                    <label style={{display: 'flex', flexDirection: 'column', gap: '7px', color: 'var(--muted)', fontSize: '10px', fontWeight: '700', letterSpacing: '.05em'}}>
                      {language === 'es' ? 'Complexión' : 'Build'}
                      <select value={fighterBuild} onChange={e => setFighterBuild(e.target.value as 'lean' | 'average' | 'stocky')} style={{width: '100%', appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '11px 34px 11px 12px', borderRadius: '11px', fontSize: '12px', backgroundImage: 'linear-gradient(45deg,transparent 50%,#7e8995 50%),linear-gradient(135deg,#7e8995 50%,transparent 50%)', backgroundPosition: 'calc(100% - 16px) 50%,calc(100% - 11px) 50%', backgroundSize: '5px 5px,5px 5px', backgroundRepeat: 'no-repeat'}}>
                        <option value="lean">{language === 'es' ? 'Delgado' : 'Lean'}</option>
                        <option value="average">{language === 'es' ? 'Promedio' : 'Average'}</option>
                        <option value="stocky">{language === 'es' ? 'Compacto' : 'Stocky'}</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}
            <div className="mobileSectionLabel">03 · {language === 'es' ? 'CONFIGURACIÓN' : 'SETUP'}</div>
            <div className="analysisOptions">
              <label>Disciplina<select value={sport} onChange={e => { setSport(e.target.value as 'boxing' | 'kickboxing'); updatePreference('sport', e.target.value as 'boxing' | 'kickboxing'); }}><option value="boxing">Boxeo</option><option value="kickboxing">Kickboxing</option></select></label>
              <label>Guardia<select value={stance} onChange={e => { setStance(e.target.value as 'orthodox' | 'southpaw' | 'switch'); updatePreference('stance', e.target.value as 'orthodox' | 'southpaw' | 'switch'); }}><option value="orthodox">Ortodoxa</option><option value="southpaw">Zurda</option><option value="switch">Switch</option></select></label>
            </div>
            <div className="optionBlock"><span>{language === 'es' ? 'Qué quieres priorizar' : 'Review focus'}</span><div className="fighters compact">{[['full','Completo'],['offense','Ataque'],['defense','Defensa'],['footwork','Footwork'],['strategy','Estrategia']].map(([id,label]) => <button key={id} className={reviewFocus === id ? 'active' : ''} onClick={() => { setReviewFocus(id); updatePreference('review_focus', id); }}>{label}</button>)}</div></div>
            <div className="optionBlock"><span>{language === 'es' ? 'Intensidad' : 'Intensity'}</span><div className="fighters compact">{[['technical','Técnico'],['light','Suave'],['moderate','Moderado'],['hard','Fuerte']].map(([id,label]) => <button key={id} className={intensity === id ? 'active' : ''} onClick={() => { setIntensity(id); updatePreference('intensity', id); }}>{label}</button>)}</div></div>
            <button className="primary" disabled={busy || !video} onClick={analyze}>{busy ? 'ANALIZANDO…' : 'ANALIZAR SPARRING'}</button>
            <button className="secondary" onClick={() => { setReport(demo); setError(''); }}>VER DEMO DEL REPORTE</button>
            {busy && <div className="processingCard"><div className="spinner"/><b>{language === 'es' ? 'REVISANDO TU SPARRING' : 'REVIEWING YOUR SPARRING'}</b>{uploadProgress > 0 && uploadProgress < 100 && <div className="uploadMeter"><span style={{width: uploadProgress + '%'}}/><b>{uploadProgress}%</b></div>}<div className="processingSteps">{['Preparando video','Identificando peleador','Revisando intercambios','Detectando patrones','Generando reporte'].map((x,i)=><span key={x} className={i <= processingStep ? 'done' : ''}><i/>{x}</span>)}</div><small>{language === 'es' ? 'El reporte solo eleva hallazgos con evidencia suficiente.' : 'The report only promotes findings with enough evidence.'}</small></div>}
            {error && <div className="error">{error}</div>}
          </div>

          <div className="panel reportPanel">
            {!displayReport ? <div className="empty"><span>03</span><h2>Tu reporte aparecerá aquí</h2><p>Los timestamps serán clickeables para volver al momento exacto del video.</p></div> : (
              <>
                <div className="reportHead"><div><span className="eyebrow">REPORTE DE COACHING</span><h2>{displayFighter}</h2></div><div className={displayReport.usedInReport ? 'aiBadge on' : 'aiBadge'}><b>{displayReport.provider}</b><small>{displayReport.usedInReport ? (language === 'es' ? 'USADO EN REPORTE' : 'USED IN REPORT') : (language === 'es' ? 'NO USADO' : 'NOT USED')}</small></div></div>
                <p className="summary">{displayReport.summary}</p>
                <div className="grid3">
                  <Card title="FORTALEZAS" items={displayReport.strengths}/><Card title="PRIORIDADES" items={displayReport.priorities}/><Card title="RIVAL" items={displayReport.opponent}/>
                </div>
                <div className="strategy"><div><h3>PLAN TÁCTICO</h3>{displayReport.plan.map((x,i)=><p key={x}><b>0{i+1}</b>{x}</p>)}</div><div><h3>DRILLS</h3>{displayReport.drills.map(x=><p key={x}>{x}</p>)}</div></div>
                <div className="visualCoach">
              <div>
                <span className="eyebrow">{language === 'es' ? 'COACH VISUAL' : 'VISUAL COACH'}</span>
                <h3>{language === 'es' ? 'Corrección en movimiento' : 'Movement correction'}</h3>
                <p>{displayReport.priorities[0] ? (language === 'es' ? `Foco: ${displayReport.priorities[0]}` : `Focus: ${displayReport.priorities[0]}`) : (language === 'es' ? 'Secuencia simplificada ligada a la corrección prioritaria.' : 'Simplified sequence tied to the priority correction.')}</p>
              </div>

              {/* Dynamic motion sequence based on top priority */}
              <div className="visualSequence">
                {(() => {
                  const priority = displayReport.priorities[0]?.toLowerCase() || '';
                  if (priority.includes('entrada') || priority.includes('entry') || priority.includes('prepar')) {
                    return (<><span>GUARD</span><b>→</b><span>FEINT</span><b>→</b><span>STEP</span><b>→</b><span>STRIKE</span></>);
                  }
                  if (priority.includes('base') || priority.includes('recuper') || priority.includes('compact') || priority.includes('balance')) {
                    return (<><span>STRIKE</span><b>→</b><span>RECOIL</span><b>→</b><span>BASE</span><b>→</b><span>GUARD</span></>);
                  }
                  if (priority.includes('ángulo') || priority.includes('angle') || priority.includes('lateral') || priority.includes('pivote') || priority.includes('pivot') || priority.includes('salida')) {
                    return (<><span>ENGAGE</span><b>→</b><span>ANGLE</span><b>→</b><span>PIVOT</span><b>→</b><span>EXIT</span></>);
                  }
                  if (priority.includes('distancia') || priority.includes('distance') || priority.includes('espacio') || priority.includes('space')) {
                    return (<><span>MEASURE</span><b>→</b><span>CONTROL</span><b>→</b><span>ENTER</span><b>→</b><span>EXIT</span></>);
                  }
                  return (<><span>GUARD</span><b>→</b><span>ANGLE</span><b>→</b><span>EXIT</span></>);
                })()}
              </div>

              {/* Enhanced trajectory visualization */}
              <div className="trajectory">
                <svg viewBox="0 0 200 60" style={{width: '100%', height: '60px'}} aria-hidden="true">
                  {/* Ring outline */}
                  <ellipse cx="100" cy="30" rx="90" ry="25" fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4,4"/>
                  {/* Fighter path */}
                  <path d="M20,30 Q50,10 90,15 Q130,20 150,30 Q130,40 90,45 Q50,50 20,30" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray="5,3" opacity="0.6">
                    <animate attributeName="stroke-dashoffset" from="300" to="0" dur="3s" repeatCount="indefinite"/>
                  </path>
                  {/* Fighter position indicator */}
                  <circle r="6" fill="var(--accent)" opacity="0.9">
                    <animateMotion path="M20,30 Q50,10 90,15 Q130,20 150,30 Q130,40 90,45 Q50,50 20,30" dur="3s" repeatCount="indefinite" rotate="auto"/>
                  </circle>
                  {/* Key positions markers */}
                  <circle cx="20" cy="30" r="3" fill="var(--muted)" opacity="0.5"/>
                  <circle cx="90" cy="15" r="3" fill="var(--accent)" opacity="0.7"/>
                  <circle cx="150" cy="30" r="3" fill="var(--muted)" opacity="0.5"/>
                  <circle cx="90" cy="45" r="3" fill="var(--accent)" opacity="0.7"/>
                </svg>
                <div className="trajectoryLabels" style={{display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginTop: '4px', padding: '0 8px'}}>
                  <span>{language === 'es' ? 'GUARDIA' : 'GUARD'}</span>
                  <span>{language === 'es' ? 'ÁNGULO' : 'ANGLE'}</span>
                  <span>{language === 'es' ? 'SALIDA' : 'EXIT'}</span>
                  <span>{language === 'es' ? 'RESET' : 'RESET'}</span>
                </div>
              </div>

              {/* Angle visualization */}
              <div className="angleViz" style={{marginTop: '12px', padding: '12px', background: 'var(--surface-2)', borderRadius: '12px', border: '1px solid var(--line)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                  <span className="eyebrow" style={{fontSize: '10px'}}>{language === 'es' ? 'ÁNGULOS DE ATAQUE Y SALIDA' : 'ATTACK & EXIT ANGLES'}</span>
                  <span style={{fontSize: '11px', color: 'var(--muted)'}}>{language === 'es' ? 'Trazado ideal' : 'Ideal path'}</span>
                </div>
                <svg viewBox="0 0 180 50" style={{width: '100%', height: '50px'}} aria-hidden="true">
                  {/* Center line */}
                  <line x1="90" y1="5" x2="90" y2="45" stroke="var(--line)" strokeWidth="1" strokeDasharray="2,4"/>
                  {/* Attack angles */}
                  <line x1="90" y1="30" x2="40" y2="15" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.7">
                    <animate attributeName="stroke-dashoffset" from="60" to="0" dur="2s" repeatCount="indefinite"/>
                  </line>
                  <line x1="90" y1="30" x2="60" y2="10" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.5" strokeDasharray="4,2"/>
                  {/* Exit angles */}
                  <line x1="90" y1="30" x2="140" y2="15" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.7">
                    <animate attributeName="stroke-dashoffset" from="60" to="0" dur="2s" repeatCount="indefinite"/>
                  </line>
                  <line x1="90" y1="30" x2="120" y2="10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.5" strokeDasharray="4,2"/>
                  {/* Fighter center */}
                  <circle cx="90" cy="30" r="8" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.5"/>
                  <text x="90" y="33" textAnchor="middle" fontSize="8" fill="var(--text)" fontWeight="700">YOU</text>
                </svg>
              </div>
            </div>
                <div className="reportActions"><button onClick={() => navigator.share?.({title:'Fight AI',text:displayReport.summary})}>{language === 'es' ? 'COMPARTIR' : 'SHARE'}</button><button onClick={() => generatePDF(displayReport, displayFighter, language, preferences).save(`fight-ai-report-${displayFighter.replace(/\s+/g,'-')}.pdf`)}>{language === 'es' ? 'EXPORTAR PDF' : 'EXPORT PDF'}</button></div>
                <h3 className="evidenceTitle">{language === 'es' ? 'EVIDENCIA DEL MOTOR' : 'ENGINE EVIDENCE'}</h3>
                <div className="evidence">{displayReport.evidence.map(e => <button key={e.time+e.title} onClick={() => jump(e.time)}><time>{e.time}</time><div><b>{e.title}</b><span>{e.observation}</span><small>Corrección: {e.correction}</small></div></button>)}</div>
              </>
            )}
          </div>
        </section>
      )}

      <nav className="bottomNav">{[
        ['home','⌂','Inicio'],['sessions','◷','Sesiones'],['analyze','＋','Analizar'],['progress','↗','Progreso'],['profile','◎','Perfil']
      ].map(([id,icon,label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id as typeof activeTab)}><span>{icon}</span><small>{label}</small></button>)}</nav>
      <footer>Fight AI · Herramienta de apoyo técnico. No reemplaza a un entrenador.</footer>
    </main>
  );
}

function generatePDF(report: Report, fighter: string, lang: 'es' | 'en', preferences: UserPreferences) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = 20;

  // Colors
  const accent: [number, number, number] = [223, 255, 56];
  const textColor: [number, number, number] = [30, 30, 30];
  const mutedColor: [number, number, number] = [100, 100, 100];
  const surfaceColor: [number, number, number] = [240, 240, 240];

  // Helper functions
  const addText = (text: string, x: number, yPos: number, options: { fontSize?: number; fontStyle?: string; color?: [number, number, number]; maxWidth?: number } = {}) => {
    doc.setFontSize(options.fontSize || 10);
    doc.setFont('helvetica', options.fontStyle || 'normal');
    const color = options.color || textColor;
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, options.maxWidth || (pageWidth - margin * 2));
    doc.text(lines, x, yPos);
    return yPos + lines.length * (options.fontSize || 10) * 0.5;
  };

  const addSectionTitle = (title: string, yPos: number) => {
    doc.setFillColor(surfaceColor[0], surfaceColor[1], surfaceColor[2]);
    doc.roundedRect(margin - 2, yPos - 4, pageWidth - margin * 2 + 4, 14, 3, 3, 'F');
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin - 2, yPos - 4, pageWidth - margin * 2 + 4, 14, 3, 3, 'S');
    yPos = addText(title, margin + 4, yPos + 4, { fontSize: 10, fontStyle: 'bold', color: accent });
    return yPos + 4;
  };

  // Header
  doc.setFillColor(9, 11, 14);
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FIGHT AI', margin, 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('SPARRING ANALYST', margin, 22);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE COACHING', pageWidth - margin, 15, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US'), pageWidth - margin, 22, { align: 'right' });
  y = 42;

  // Fighter name
  y = addText(fighter, margin, y, { fontSize: 18, fontStyle: 'bold' });
  y += 4;

  // Provider badge
  const providerText = report.usedInReport
    ? `${report.provider} ${lang === 'es' ? '(USADO EN REPORTE)' : '(USED IN REPORT)'}`
    : `${report.provider} ${lang === 'es' ? '(NO USADO)' : '(NOT USED)'}`;
  y = addText(providerText, margin, y, { fontSize: 8, fontStyle: 'normal', color: report.usedInReport ? accent : mutedColor });
  y += 6;

  // Summary
  y = addSectionTitle(lang === 'es' ? 'CONCLUSIÓN PRINCIPAL' : 'MAIN TAKEAWAY', y);
  y = addText(report.summary, margin, y, { fontSize: 11 });
  y += 6;

  // Three-column section: Strengths, Priorities, Opponent
  const colWidth = (pageWidth - margin * 2 - 12) / 3;
  const startY = y;
  let maxY = y;

  // Strengths
  y = addSectionTitle(lang === 'es' ? 'FORTALEZAS' : 'STRENGTHS', y);
  report.strengths.forEach((s, i) => {
    y = addText(`${i + 1}. ${s}`, margin + 4, y, { fontSize: 9, maxWidth: colWidth - 8 });
    y += 2;
  });
  maxY = Math.max(maxY, y);
  y = startY;

  // Priorities
  y = addSectionTitle(lang === 'es' ? 'PRIORIDADES' : 'PRIORITIES', y);
  report.priorities.forEach((p, i) => {
    y = addText(`${i + 1}. ${p}`, margin + colWidth + 10, y, { fontSize: 9, maxWidth: colWidth - 8 });
    y += 2;
  });
  maxY = Math.max(maxY, y);
  y = startY;

  // Opponent
  y = addSectionTitle(lang === 'es' ? 'ANÁLISIS DEL RIVAL' : 'OPPONENT ANALYSIS', y);
  report.opponent.forEach((o, i) => {
    y = addText(`${i + 1}. ${o}`, margin + 2 * colWidth + 16, y, { fontSize: 9, maxWidth: colWidth - 8 });
    y += 2;
  });
  maxY = Math.max(maxY, y);
  y = maxY + 8;

  // Plan Táctico
  y = addSectionTitle(lang === 'es' ? 'PLAN TÁCTICO' : 'TACTICAL PLAN', y);
  report.plan.forEach((p, i) => {
    y = addText(`${i + 1}. ${p}`, margin, y, { fontSize: 9, maxWidth: pageWidth - margin * 2 });
    y += 2;
  });
  y += 4;

  // Drills
  y = addSectionTitle(lang === 'es' ? 'DRILLS ASIGNADOS' : 'ASSIGNED DRILLS', y);
  report.drills.forEach((d, i) => {
    y = addText(`${i + 1}. ${d}`, margin, y, { fontSize: 9, maxWidth: pageWidth - margin * 2 });
    y += 2;
  });
  y += 4;

  // Evidence
  if (report.evidence.length > 0) {
    y = addSectionTitle(lang === 'es' ? 'EVIDENCIA POR TIMESTAMP' : 'TIMESTAMP EVIDENCE', y);

    // Table header
    doc.setFillColor(surfaceColor[0], surfaceColor[1], surfaceColor[2]);
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'S');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    const timeCol = margin + 4;
    const titleCol = margin + 24;
    const obsCol = margin + 60;
    const corrCol = margin + 120;
    doc.text(lang === 'es' ? 'TIEMPO' : 'TIME', timeCol, y + 5);
    doc.text(lang === 'es' ? 'TÍTULO' : 'TITLE', titleCol, y + 5);
    doc.text(lang === 'es' ? 'OBSERVACIÓN' : 'OBSERVATION', obsCol, y + 5);
    doc.text(lang === 'es' ? 'CORRECCIÓN' : 'CORRECTION', corrCol, y + 5);
    y += 10;

    report.evidence.forEach((e, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(i % 2 === 0 ? textColor[0] : mutedColor[0], i % 2 === 0 ? textColor[1] : mutedColor[1], i % 2 === 0 ? textColor[2] : mutedColor[2]);
      doc.text(e.time, timeCol, y + 3);
      const titleLines = doc.splitTextToSize(e.title, 34);
      const obsLines = doc.splitTextToSize(e.observation, 58);
      const corrLines = doc.splitTextToSize(e.correction, 60);
      const maxLines = Math.max(titleLines.length, obsLines.length, corrLines.length);
      doc.text(titleLines, titleCol, y + 3);
      doc.text(obsLines, obsCol, y + 3);
      doc.text(corrLines, corrCol, y + 3);
      y += maxLines * 3.5 + 2;
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
    doc.text('Fight AI · Herramienta de apoyo técnico. No reemplaza a un entrenador.', pageWidth / 2, 290, { align: 'center' });
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, 290, { align: 'right' });
  }

  return doc;
}

function Card({ title, items }: { title: string; items: string[] }) {
  return <div className="card"><h3>{title}</h3>{items.map(x => <p key={x}>{x}</p>)}</div>;
}
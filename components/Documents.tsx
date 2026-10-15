'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStudy, unitWord } from '@/lib/store';
import { ACCEPT } from '@/lib/docs/parse';
import { deleteDocument, getPages, importDocument } from '@/lib/docs/library';
import { resolveGoal } from '@/lib/docs/match';
import { rememberConsent, screenSupported, startWatching, stopWatching, useScreen, type ScreenState } from '@/lib/docs/screen';
import { docDownloadUrl } from '@/lib/sync';
import type { DocMeta, DocPage, SeenEvent } from '@/lib/types';
import { Icon } from './Icon';
import { useArmed } from './Panels';
import { ensureDigest, useDigests } from '@/lib/ai/digest';

// A shared empty list: a fresh [] in a store selector would re-render forever.
const NO_EVENTS: SeenEvent[] = [];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const KIND_LABEL: Record<DocMeta['kind'], string> = { pdf: 'PDF', pptx: 'PowerPoint', docx: 'Word', text: 'Text', image: 'Photos' };
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function useDocPages(id: string): DocPage[] {
  const [pages, setPages] = useState<DocPage[]>([]);
  useEffect(() => {
    let alive = true;
    setPages([]);
    if (id) void getPages(id).then((p) => { if (alive) setPages(p); });
    return () => { alive = false; };
  }, [id]);
  return pages;
}

/* ---------------- in "What you're studying" ---------------- */

export function StudyMaterial({ onManage }: { onManage: () => void }) {
  const docs = useStudy((s) => s.docs);
  const docId = useStudy((s) => s.context.docId);
  const { selectDoc } = useStudy.getState();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = docs.find((d) => d.id === docId);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setErr(''); setBusy('Opening…');
    try { await importDocument(files, setBusy); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(''); }
  };

  // The AI reads a document once; a document from another device gets read the first time it's opened here.
  useEffect(() => { if (docId) void ensureDigest(docId); }, [docId]);

  return (
    <div className="material" id="materialField">
      <div className="mat-row">
        {docs.length > 0 && (
          <>
            <label className="sr-only" htmlFor="docSelect">Document</label>
            <select id="docSelect" value={docId} onChange={(e) => selectDoc(e.target.value)}>
              <option value="">No document</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.pageCount} {unitWord(d, d.pageCount)}</option>)}
            </select>
          </>
        )}
        <button className="btn" type="button" disabled={!!busy} title="PDF, PowerPoint, Word, text or photos of your notes" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />{docs.length ? 'Upload' : 'Upload slides or notes'}
        </button>
        {docs.length > 0 && <button className="icon-btn" type="button" aria-label="Manage documents" title="Manage documents" onClick={onManage}><Icon name="file" /></button>}
      </div>
      <input ref={fileRef} id="docInput" type="file" accept={ACCEPT} multiple hidden onChange={onFiles} />
      {busy && <p className="hint loading-line"><span className="spin" aria-hidden="true" />{busy}</p>}
      {err && <p className="hint warn" role="alert">{err}</p>}
      {doc && <DigestLine docId={doc.id} />}
      {doc && <DocPlan key={doc.id} doc={doc} />}
      <ScreenShareRow />
    </div>
  );
}

/** What the AI took from the document: a one-line status, with the key ideas a click away. */
function DigestLine({ docId }: { docId: string }) {
  const d = useDigests((s) => s[docId]);
  if (!d || d.status === 'failed') return null;
  if (d.status === 'reading') return <p className="digest-line"><span className="spin" aria-hidden="true" />Reading it with AI…</p>;
  const g = d.data!;
  return (
    <details className="digest-line ready">
      <summary><Icon name="sparkle" />Read by AI{g.topic ? <>: <strong>{g.topic}</strong></> : null}</summary>
      <p>{g.summary}</p>
      {g.concepts.length > 0 && <ul className="digest-concepts">{g.concepts.map((c) => <li key={c}>{c}</li>)}</ul>}
    </details>
  );
}

/** Open the screen-tracking explainer (the dialog lives at the app root). */
export function openScreenConsent() {
  (document.getElementById('screenDlg') as HTMLDialogElement | null)?.showModal();
}

/** Start screen tracking from a click: turn it on, then explain first or go straight to the share picker. */
export function beginScreenShare() {
  const s = useStudy.getState();
  if (!s.settings.screenTrack) s.updateSettings((x) => { x.screenTrack = true; });
  let agreed = false;
  try { agreed = localStorage.getItem('studybuddy.screenConsent') === '1'; } catch { /* blocked */ }
  if (agreed) void startWatching(); else openScreenConsent();
}

/** Screen sharing, right under the study material so it's easy to find. */
function ScreenShareRow() {
  const scr = useScreen();
  const withSound = useStudy((s) => s.settings.screenAudio);
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { setOk(screenSupported()); }, []);
  if (ok === null) return null;
  if (!ok) return null; // phones and tablets can't share a screen
  if (scr.status === 'watching') {
    return (
      <div className="share-row on">
        <span className="watch-pill"><span className="rec" aria-hidden="true" />Sharing {scr.label}</span>
        <button className="btn-quiet" type="button" onClick={stopWatching}>Stop sharing</button>
        <p className="hint">{audioLine(scr.audio, scr.audioLoad) || 'It reads your slides only while a study session is running.'}</p>
      </div>
    );
  }
  return (
    <div className="share-row">
      <button className="btn-quiet" type="button" id="shareScreenBtn" aria-label="Share screen to track slides" title="Follows which slide you're on while you study"
        disabled={scr.status === 'starting'} onClick={beginScreenShare}>
        <Icon name="monitor" />{scr.status === 'starting' ? 'Choose a window…' : 'Share screen'}
      </button>
      <label className="check-inline" htmlFor="shareSound" title="For video lectures: what's said becomes notes for your quiz">
        <input type="checkbox" id="shareSound" checked={withSound} onChange={(e) => { const v = e.target.checked; useStudy.getState().updateSettings((x) => { x.screenAudio = v; }); }} />
        with sound
      </label>
    </div>
  );
}

/** One line on what's happening with the tab's sound, or '' when sound isn't in use. */
function audioLine(audio: ScreenState['audio'], load: number): string {
  if (audio === 'loading') return load > 0 && load < 100 ? `Getting the speech reader ready… ${load}% (first time only)` : 'Getting the speech reader ready…';
  if (audio === 'listening') return 'Listening. What the lecture says becomes notes while you study.';
  if (audio === 'none') return 'No sound came through. Share a Chrome or Edge tab with "Also share tab audio" ticked.';
  if (audio === 'failed') return 'The speech reader didn\'t start. Slide tracking still works.';
  return '';
}

function DocPlan({ doc }: { doc: DocMeta }) {
  const c = useStudy((s) => s.context);
  const { setDocGoal, setStartPage } = useStudy.getState();
  const pages = useDocPages(doc.id);
  const [text, setText] = useState(c.docGoal);
  const [picking, setPicking] = useState(false);
  useEffect(() => { setText(c.docGoal); setPicking(false); }, [c.docGoal, c.goalPage]);

  const unit = unitWord(doc, 1);
  const items = pages.length ? pages : doc.titles.map((t, i) => ({ index: i + 1, title: t, text: '' }));
  const titleOf = (n: number) => doc.titles[n - 1] || `${cap(unit)} ${n}`;
  const editing = text.trim() !== c.docGoal.trim();
  const proposal = editing && text.trim() ? resolveGoal(text, items, c.startPage) : null;
  const options = (from: number) => doc.titles.map((t, i) => i + 1).filter((n) => n >= from)
    .map((n) => <option key={n} value={n}>{cap(unit)} {n} · {titleOf(n)}</option>);
  const confirm = (page: number) => { setDocGoal(text.trim() || `${unit} ${page}`, page); setPicking(false); };

  return (
    <div className="doc-plan">
      <div className="row2">
        <div className="field">
          <label htmlFor="startPage">Start at</label>
          <select id="startPage" value={c.startPage} onChange={(e) => setStartPage(Number(e.target.value))}>{options(1)}</select>
        </div>
        <div className="field">
          <label htmlFor="docGoal">Goal</label>
          <input type="text" id="docGoal" maxLength={140} placeholder={`e.g. up to ${unit} ${Math.min(doc.pageCount, c.startPage + 5)}, or a ${unit} title`}
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && proposal) { e.preventDefault(); confirm(proposal.page); } }} />
        </div>
      </div>
      {doc.furthest > 0 && c.startPage > 1 && !editing && (
        <p className="hint">Resume at {unit} {c.startPage}: {titleOf(c.startPage)}</p>
      )}
      {editing && text.trim() && proposal && !picking && (
        <div className="goal-box" role="status">
          <p>Goal: {unitWord(doc, 2)} {c.startPage}–{proposal.page}, ending at <strong>&ldquo;{titleOf(proposal.page)}&rdquo;</strong> ({unit} {proposal.page}). Correct?</p>
          <div className="btn-row">
            <button className="btn btn-primary" type="button" onClick={() => confirm(proposal.page)}>Yes, set goal</button>
            <button className="btn-quiet" type="button" onClick={() => setPicking(true)}>Pick another {unit}</button>
          </div>
        </div>
      )}
      {editing && text.trim() && (!proposal || picking) && (
        <div className="goal-box">
          <p>{proposal ? `Which ${unit} is the goal?` : `Couldn't find "${text.trim()}". Which ${unit} is it?`}</p>
          <select aria-label={`Goal ${unit}`} defaultValue="" onChange={(e) => e.target.value && confirm(Number(e.target.value))}>
            <option value="" disabled>Choose a {unit}…</option>
            {options(c.startPage)}
          </select>
        </div>
      )}
      {!editing && c.goalPage > 0 && (
        <div className="goal-box set">
          <p><Icon name="check" /> Goal: up to {unit} {c.goalPage} · <strong>{titleOf(c.goalPage)}</strong></p>
          <button className="btn-quiet" type="button" onClick={() => { setText(''); setDocGoal('', 0); }}>Clear goal</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- on the timer ---------------- */

export function DocProgress() {
  const T = useStudy((s) => s.timer);
  const c = useStudy((s) => s.context);
  const docs = useStudy((s) => s.docs);
  const sess = T.phase === 'study' ? T.session : null;
  const doc = docs.find((d) => d.id === (sess?.docId ?? c.docId));
  if (!doc || T.phase !== 'study') return null;
  const unit = unitWord(doc, 1);
  const N = doc.pageCount;
  const start = sess?.startPage ?? c.startPage;
  const goal = sess?.goalPage ?? (c.goalPage || 0);
  const lastSeen = sess?.seen?.filter((e) => e.page > 0).at(-1)?.page;
  const current = lastSeen ?? sess?.endPage ?? start;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / N) * 100))}%`;
  const left = goal ? Math.max(0, goal - current) : 0;
  const title = doc.titles[current - 1] || '';
  const step = (n: number) => {
    const p = Math.min(N, Math.max(1, n));
    useStudy.getState().recordProgress(p, doc.titles[p - 1] || '', 'manual');
  };
  return (
    <div className="doc-progress" aria-live="polite">
      <div className="dp-text">
        <span><strong>{cap(unit)} {current}</strong> of {N}{title ? ` · ${title}` : ''}</span>
        {goal > 0 && <span className="muted">{left === 0 && current >= goal ? 'Goal reached' : `Goal: ${unit} ${goal} · ${left} to go`}</span>}
      </div>
      <div className="dp-bar" aria-hidden="true">
        <span className="dp-fill" style={{ width: pct(current) }} />
        {goal > 0 && <span className="dp-goal" style={{ left: pct(goal) }} />}
      </div>
      {sess && (
        <div className="dp-steps">
          <button className="icon-btn sm" type="button" aria-label={`Previous ${unit}`} onClick={() => step(current - 1)}>‹</button>
          <label className="sr-only" htmlFor="nowOn">I&apos;m on {unit}</label>
          <select id="nowOn" value={current} onChange={(e) => step(Number(e.target.value))}>
            {doc.titles.map((t, i) => <option key={i} value={i + 1}>{cap(unit)} {i + 1}</option>)}
          </select>
          <button className="icon-btn sm" type="button" aria-label={`Next ${unit}`} onClick={() => step(current + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

export function ScreenTracker({ onConsent }: { onConsent: () => void }) {
  const enabled = useStudy((s) => s.settings.screenTrack);
  const phase = useStudy((s) => s.timer.phase);
  const seen = useStudy((s) => s.timer.session?.seen ?? NO_EVENTS);
  const scr = useScreen();
  const { showToast } = useStudy.getState();
  useEffect(() => { if (scr.error) { showToast(scr.error); useScreen.setState({ error: '' }); } }, [scr.error, showToast]);
  if (phase !== 'study' || !screenSupported()) return null;
  if (!enabled && scr.status !== 'watching') return null;
  void onConsent;
  const begin = beginScreenShare;
  if (scr.status !== 'watching') {
    return (
      <div className="watch-row">
        <button className="btn-quiet" type="button" disabled={scr.status === 'starting'} onClick={begin}>
          <Icon name="monitor" />{scr.status === 'starting' ? 'Choose a window…' : 'Track my slides from the screen'}
        </button>
      </div>
    );
  }
  const log = seen.slice(-8).reverse();
  return (
    <div className="watch-row">
      <span className="watch-pill"><span className="rec" aria-hidden="true" />Watching {scr.label}{scr.reading ? ' · reading…' : ''}</span>
      <button className="btn-quiet" type="button" onClick={stopWatching}>Stop</button>
      {scr.audio !== 'off' && <HeardLine />}
      {log.length > 0 && (
        <details className="seen-log">
          <summary>{seen.length} read so far</summary>
          <ul>{log.map((e) => <li key={e.at}><span className="when">{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>{e.page ? `#${e.page} ` : ''}{e.title || '(no title)'}</li>)}</ul>
          <button className="btn-quiet" type="button" onClick={() => useStudy.getState().clearSeen('session')}>Delete this log</button>
        </details>
      )}
    </div>
  );
}

function HeardLine() {
  const scr = useScreen();
  const heard = useStudy((s) => s.timer.session?.heard ?? '');
  const line = audioLine(scr.audio, scr.audioLoad);
  return (
    <div className="heard">
      <p className="hint"><Icon name="sound" /> {scr.audio === 'listening' && scr.heardLast ? <>Heard: &ldquo;{scr.heardLast.length > 140 ? '…' + scr.heardLast.slice(-140) : scr.heardLast}&rdquo;</> : line}</p>
      {heard && (
        <details className="seen-log">
          <summary>Lecture notes so far · {heard.split(' ').length} words</summary>
          <p className="heard-text">{heard}</p>
        </details>
      )}
    </div>
  );
}

export function ScreenConsentDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const close = () => dialogRef.current?.close();
  return (
    <dialog ref={dialogRef} id="screenDlg" aria-labelledby="screenTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dlg-head"><h2 id="screenTitle">Track your slides from the screen</h2>
        <button className="icon-btn" type="button" aria-label="Close" onClick={close}><Icon name="x" /></button></div>
      <div className="dlg-body consent">
        <ul>
          <li><strong>What:</strong> only the window or tab you pick. Choose the one with your slides, not your whole screen.</li>
          <li><strong>How often:</strong> a quick check every {useStudy.getState().settings.screenSec} second{useStudy.getState().settings.screenSec === 1 ? '' : 's'}, only while a study session is running. Paused sessions and breaks are never watched.</li>
          <li><strong>Sound (optional):</strong> with &ldquo;Capture the tab&apos;s sound&rdquo; on, what a lecture says is turned into text on this device. The sound itself is never saved or uploaded.</li>
          <li><strong>What&apos;s kept:</strong> the slide number and title it read. The images themselves stay in memory on this device and are thrown away right after.</li>
          <li><strong>How to stop:</strong> click Stop, end the session, or use your browser&apos;s &ldquo;Stop sharing&rdquo; button.</li>
        </ul>
      </div>
      <div className="dlg-foot">
        <button className="btn-quiet" type="button" onClick={close}>Not now</button>
        <button className="btn btn-primary" type="button" onClick={() => { rememberConsent(); close(); void startWatching(); }}>Choose window to share</button>
      </div>
    </dialog>
  );
}

/* ---------------- after a session ---------------- */

export function ReachPicker() {
  const id = useStudy((s) => s.timer.lastSessionId);
  const rec = useStudy((s) => s.history.find((h) => h.id === id));
  const docs = useStudy((s) => s.docs);
  const doc = rec?.docId ? docs.find((d) => d.id === rec.docId) : undefined;
  if (!rec || !doc) return null;
  const unit = unitWord(doc, 1);
  const from = rec.startPage ?? 1;
  return (
    <div className="reach">
      <label htmlFor="reached">How far did you get?</label>
      <select id="reached" value={rec.endPage ?? from} onChange={(e) => useStudy.getState().setReached(rec.id, Number(e.target.value))}>
        {doc.titles.map((t, i) => i + 1).filter((n) => n >= from).map((n) => <option key={n} value={n}>{cap(unit)} {n} · {doc.titles[n - 1]}</option>)}
      </select>
      <span className="muted small">
        of {doc.pageCount}
        {rec.goalPage ? (rec.goalMet ? ' · Goal met' : ` · Goal was ${unit} ${rec.goalPage}`) : ''}
        {rec.progressSource === 'screen' ? ' · from screen tracking' : ''}
      </span>
    </div>
  );
}

/* ---------------- library ---------------- */

export function DocumentsDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const docs = useStudy((s) => s.docs);
  const current = useStudy((s) => s.context.docId);
  const signedIn = useStudy((s) => s.account.status === 'guest' || s.account.status === 'user');
  const [open, setOpen] = useState('');
  const close = () => dialogRef.current?.close();
  return (
    <dialog ref={dialogRef} id="docsDlg" aria-labelledby="docsTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dlg-head"><h2 id="docsTitle">Your documents</h2>
        <button className="icon-btn" type="button" aria-label="Close documents" onClick={close}><Icon name="x" /></button></div>
      <div className="dlg-body">
        {!docs.length && <p className="empty">No documents yet. Use Upload in &ldquo;What you&apos;re studying&rdquo;.</p>}
        <ul className="doc-list">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} current={d.id === current} open={open === d.id} canDownload={signedIn}
              onToggle={() => setOpen(open === d.id ? '' : d.id)} onStudy={() => { useStudy.getState().selectDoc(d.id); close(); }} />
          ))}
        </ul>
      </div>
    </dialog>
  );
}

function DocRow({ doc, current, open, canDownload, onToggle, onStudy }: {
  doc: DocMeta; current: boolean; open: boolean; canDownload: boolean; onToggle: () => void; onStudy: () => void;
}) {
  const [armed, press] = useArmed();
  const unit = unitWord(doc, 1);
  const pct = doc.pageCount ? Math.round((doc.furthest / doc.pageCount) * 100) : 0;
  const download = async () => {
    const url = doc.storagePath ? await docDownloadUrl(doc.storagePath) : null;
    if (url) window.open(url, '_blank', 'noopener'); else useStudy.getState().showToast('The original file isn\'t saved in your account.');
  };
  return (
    <li className="doc-item">
      <div className="doc-top">
        <div className="doc-name">
          <strong>{doc.name}</strong>
          <span className="muted small">{KIND_LABEL[doc.kind]} · {doc.pageCount} {unitWord(doc, doc.pageCount)} · {size(doc.size)} · added {new Date(doc.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="btn-row">
          {!current && <button className="btn" type="button" onClick={onStudy}>Study this</button>}
          {current && <span className="pill good">Studying</span>}
          <button className="btn-quiet" type="button" aria-expanded={open} onClick={onToggle}>{open ? 'Hide outline' : 'Outline'}</button>
          {canDownload && doc.storagePath && <button className="btn-quiet" type="button" onClick={download}><Icon name="download" />Original</button>}
          <button className="btn-quiet danger" type="button" onClick={() => press(() => void deleteDocument(doc))}><Icon name="trash" />{armed ? 'Click again to delete' : 'Delete'}</button>
        </div>
      </div>
      <div className="dp-bar" aria-hidden="true"><span className="dp-fill" style={{ width: `${pct}%` }} /></div>
      <p className="muted small" style={{ margin: 0 }}>{doc.furthest ? `Reached ${unit} ${doc.furthest} of ${doc.pageCount} (${pct}%)` : 'Not started yet'}</p>
      {open && (
        <ol className="doc-outline">
          {doc.titles.map((t, i) => (
            <li key={i} className={i + 1 <= doc.furthest ? 'done' : ''}><span className="n">{i + 1}</span>{t}{i + 1 <= doc.furthest && <Icon name="check" />}</li>
          ))}
        </ol>
      )}
    </li>
  );
}

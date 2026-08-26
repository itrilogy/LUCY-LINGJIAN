import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { categoryPool, type CatalogFile, type Category } from "../../shared/catalog";
import type { Mix } from "../../shared/mixSchema";
import { fetchMix, fetchMixes, removeMix, saveMix } from "../api/client";
import { engine } from "../audio/MixEngine";
import { formatPct } from "../audio/volume";
import { BRAND } from "../brand";
import { AboutModal } from "../components/AboutModal";
import { MomentPanel } from "../components/MomentPanel";
import { composeMomentMix } from "../moment/compose";
import { useMoment } from "../moment/useMoment";
import { ephemeralCategoryMix, ephemeralFileMix, useStore } from "../mix/store";
import type { PlayNavState } from "../play/nav";

const MIX_W_KEY = "voicestream_mix_width";
const MIX_W_DEFAULT = 440;
const MIX_W_MIN = 340;
const MIX_W_MAX = 720;

export function LibraryPage() {
  const nav = useNavigate();
  const catalog = useStore((s) => s.catalog);
  const draft = useStore((s) => s.draft);
  const mixes = useStore((s) => s.mixes);
  const {
    addFile, addCategory, updateTrack, removeTrack, rename, setMaster,
    newMix, clearTracks, loadDraft, setMixes,
  } = useStore();
  const [openCat, setOpenCat] = useState<string>("noise");
  const [about, setAbout] = useState(false);
  const moment = useMoment();
  const [mixW, setMixW] = useState(() => {
    const n = Number(localStorage.getItem(MIX_W_KEY));
    return Number.isFinite(n) && n >= MIX_W_MIN ? n : MIX_W_DEFAULT;
  });
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const mixWRef = useRef(mixW);
  mixWRef.current = mixW;

  useEffect(() => {
    void fetchMixes().then(setMixes).catch(() => undefined);
  }, [setMixes]);

  const files = useMemo(() => {
    if (!catalog) return [];
    return categoryPool(openCat as Category["id"], catalog.files);
  }, [catalog, openCat]);

  const saved = mixes.some((m) => m.id === draft.id);

  if (!catalog) return <div className="lib">读取目录…</div>;

  const goPlay = (path: string, mix: Mix, momentTags?: string[]) => {
    if (!catalog) return;
    engine.arm();
    void engine.start(mix, catalog).catch((e) => console.warn(e));
    const state: PlayNavState = { autoplay: true, mix, momentTags };
    nav(path, { state });
  };

  const playMoment = () => {
    if (!catalog) return;
    const mix = composeMomentMix(catalog, moment.hit);
    goPlay(`/play/mix/${mix.id}`, mix, moment.hit.tags);
  };

  const playDraft = () => {
    if (draft.tracks.length < 1) return;
    const mix: Mix = { ...draft, updated_at: new Date().toISOString() };
    goPlay(`/play/mix/${mix.id}`, mix);
    void saveMix(mix).then(async () => setMixes(await fetchMixes())).catch(() => undefined);
  };

  const playSaved = async (id: string) => {
    engine.arm();
    const mix = draft.id === id && draft.tracks.length > 0 ? draft : await fetchMix(id);
    goPlay(`/play/mix/${mix.id}`, mix);
  };

  const onSplitDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startW: mixW };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSplitMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = Math.min(
      MIX_W_MAX,
      Math.max(MIX_W_MIN, drag.current.startW - (e.clientX - drag.current.startX)),
    );
    mixWRef.current = next;
    setMixW(next);
  };
  const onSplitUp = () => {
    if (!drag.current) return;
    drag.current = null;
    localStorage.setItem(MIX_W_KEY, String(mixWRef.current));
  };

  return (
    <div className="lib" style={{ gridTemplateColumns: `240px minmax(0, 1fr) 6px ${mixW}px` }}>
      <aside>
        <div className="brand">
          <img src="/brand/lingjian-mark.svg" width={36} height={36} alt="" />
          <div>
            <h1>{BRAND.nameZh}</h1>
            <span>{BRAND.nameEn}</span>
          </div>
        </div>
        <p className="hint slogan">{BRAND.slogan}</p>
        <p className="hint">循环混音 · 无时限 · 标签背景</p>
        <div className="brand-ops">
          <button type="button" className="about-btn" onClick={() => setAbout(true)}>关于</button>
          <button type="button" className="now-btn" title="按此刻天气与时辰命中标签，随机组混音" onClick={() => playMoment()}>
            此时此刻
          </button>
        </div>
        <h2>场景</h2>
        {catalog.scenes.map((sc) => {
          const file = catalog.files.find((f) => f.id === sc.file_id)!;
          return (
            <div className="row" key={sc.id}>
              <span>{sc.label_zh}</span>
              <span className="ops">
                <button type="button" onClick={() => addFile(file)}>+ 文件</button>
                <button type="button" title="場景單曲循環" onClick={() => goPlay(`/play/file/${file.id}`, ephemeralFileMix(file))}>▶</button>
              </span>
            </div>
          );
        })}
        <h2>类别</h2>
        {catalog.categories.map((c) => (
          <div
            className={"row" + (openCat === c.id ? " on" : "")}
            key={c.id}
            onClick={() => setOpenCat(c.id)}
          >
            <span>{c.label_zh}</span>
            <span className="ops">
              <button type="button" onClick={(e) => { e.stopPropagation(); addCategory(c); }}>+ 整类</button>
              <button type="button" title="整類隨機循環" onClick={(e) => {
                e.stopPropagation();
                goPlay(`/play/category/${c.id}`, ephemeralCategoryMix(c));
              }}>▶</button>
            </span>
          </div>
        ))}
        <h2>混音</h2>
        <div className="row">
          <button className="primary full" type="button" onClick={() => newMix()}>新建混音</button>
        </div>
        <h2>已存混音</h2>
        {mixes.length === 0 && <p className="hint">还没有保存过。</p>}
        {mixes.map((m) => (
          <div className={"row" + (m.id === draft.id ? " on" : "")} key={m.id}>
            <span>{m.name} <em>{m.track_count} 轨</em></span>
            <span className="ops">
              <button type="button" onClick={async () => loadDraft(await fetchMix(m.id))}>载入</button>
              <button type="button" title="按此混音循環播放" onClick={() => void playSaved(m.id)}>▶</button>
              <button type="button" onClick={async () => {
                await removeMix(m.id);
                setMixes(await fetchMixes());
                if (draft.id === m.id) newMix();
              }}>×</button>
            </span>
          </div>
        ))}
      </aside>
      <section className="files">
        <h2>{catalog.categories.find((c) => c.id === openCat)?.label_zh} · 点选加入或单曲循环</h2>
        <ul>
          {files.map((f) => (
            <FileRow key={f.id} file={f} onAdd={() => addFile(f)} onPlay={() => goPlay(`/play/file/${f.id}`, ephemeralFileMix(f))} />
          ))}
        </ul>
      </section>
      <div
        className="split"
        onPointerDown={onSplitDown}
        onPointerMove={onSplitMove}
        onPointerUp={onSplitUp}
        title="拖动调整混音栏宽度"
      />
      <section className="mix">
        <div className="mix-body">
          <p className="hint">{saved ? "正在编辑已存混音" : "未保存的新混音"} · {draft.tracks.length}/8 轨</p>
          <input className="name" value={draft.name} onChange={(e) => rename(e.target.value)} />
          <label className="vol">
            <span>主音量</span>
            <input type="range" min={0} max={1} step={0.01} value={draft.master_volume}
              onChange={(e) => setMaster(Number(e.target.value))} />
            <b className="pct">{formatPct(draft.master_volume)}</b>
          </label>
          {draft.tracks.length === 0 && <p className="hint">从左侧加入文件、整类或独立场景。整类会在该类内随机循环，没有时限。</p>}
          <ul>
            {draft.tracks.map((t) => {
              const label = t.kind === "category"
                ? catalog.categories.find((c) => c.id === t.target_id)?.label_zh + " · 随机"
                : catalog.files.find((f) => f.id === t.target_id)?.label_zh;
              return (
                <li key={t.id}>
                  <div className="tname">
                    {label}
                    <em>{t.kind === "category" ? "类别循环" : "单文件循环"}</em>
                  </div>
                  <label className="vol">
                    <span>音量</span>
                    <input type="range" min={0} max={1} step={0.01} value={t.volume}
                      onChange={(e) => updateTrack(t.id, { volume: Number(e.target.value) })} />
                    <b className="pct">{formatPct(t.volume)}</b>
                  </label>
                  <div className="track-ops">
                    <button type="button" onClick={() => updateTrack(t.id, { muted: !t.muted })}>{t.muted ? "已静音" : "静音"}</button>
                    <button type="button" onClick={() => removeTrack(t.id)}>移除</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button type="button" onClick={() => newMix()}>新建混音</button>
            <button type="button" disabled={draft.tracks.length < 1} onClick={() => clearTracks()}>清空音轨</button>
            <button type="button" disabled={draft.tracks.length < 1} onClick={async () => {
              await saveMix({ ...draft, updated_at: new Date().toISOString() });
              setMixes(await fetchMixes());
            }}>保存</button>
            <button className="primary" type="button" title="按混音配置循環播放" disabled={draft.tracks.length < 1} onClick={() => playDraft()}>
              开始播放
            </button>
          </div>
        </div>
        <MomentPanel hit={moment.hit} now={moment.now} locating={moment.locating} weatherOk={moment.weatherOk} />
      </section>
      {about && <AboutModal onClose={() => setAbout(false)} />}
      <style>{libCss}</style>
    </div>
  );
}

function FileRow({ file, onAdd, onPlay }: { file: CatalogFile; onAdd: () => void; onPlay: () => void }) {
  return (
    <li>
      <span>{file.label_zh}</span>
      <span className="ops">
        <button type="button" onClick={onAdd}>+</button>
        <button type="button" title="單素材循環" onClick={onPlay}>▶</button>
      </span>
    </li>
  );
}

const libCss = `
.lib { display: grid; height: 100%; min-height: 100%; }
aside, .files, .mix { padding: 22px 18px 40px; min-width: 0; }
aside { border-right: 1px solid var(--line); overflow: auto; }
.files { overflow: auto; }
.mix {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
  min-height: 0;
}
.mix-body { flex: 2 1 0; overflow: auto; min-height: 0; padding-bottom: 12px; }
.split { cursor: col-resize; background: transparent; position: relative; }
.split::after { content: ""; position: absolute; inset: 0 1px; background: var(--line); }
.split:hover::after, .split:active::after { background: var(--accent); }
.brand { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; }
.brand img { border-radius: 9px; flex: none; }
.brand h1 { font-size: 18px; letter-spacing: .16em; font-weight: 600; margin: 0; }
.brand span { display: block; font-size: 10px; letter-spacing: .18em; color: var(--muted); }
.slogan { letter-spacing: .12em; margin: 0 0 4px; }
.brand-ops { display: flex; gap: 6px; align-items: center; margin: 8px 0 4px; flex-wrap: wrap; }
.about-btn, .now-btn { margin: 0; font-size: 11px; padding: 3px 10px; }
.now-btn {
  letter-spacing: .14em;
  background: rgba(0, 210, 255, .1);
  border-color: rgba(0, 210, 255, .32);
  color: #c6f4ff;
}
.now-btn:hover { background: rgba(0, 210, 255, .18); }
h1 { font-size: 13px; letter-spacing: .2em; font-weight: 500; margin: 0 0 6px; }
h2 { font-size: 11px; letter-spacing: .16em; color: var(--muted); font-weight: 500; margin: 18px 0 8px; }
.hint { color: var(--muted); font-size: 12px; }
.row { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 6px 0; cursor: pointer; }
.row.on span:first-child { color: var(--accent); }
.ops { display: flex; gap: 4px; flex-shrink: 0; }
.ops button { padding: 2px 8px; font-size: 11px; }
button.full { width: 100%; }
ul { list-style: none; margin: 0; padding: 0; }
.files li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.files li span:first-child { flex: 1; min-width: 0; }
.mix li { display: grid; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.tname { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.name { width: 100%; background: transparent; border: 0; border-bottom: 1px solid var(--line); padding: 6px 0; margin-bottom: 12px; }
.vol { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
.vol span { flex: 0 0 3em; }
.vol input[type=range] { flex: 1; min-width: 0; }
.pct { flex: 0 0 3.2em; text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; color: var(--fg); }
.track-ops { display: flex; gap: 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
em { color: var(--muted); font-style: normal; font-size: 11px; }
@media (max-width: 900px) {
  .lib { grid-template-columns: 1fr !important; }
  .split { display: none; }
  .mix { min-height: 70vh; }
}
.moment {
  position: relative;
  flex: 1 1 0;
  min-height: 200px;
  max-height: 34%;
  overflow: hidden;
  padding: 16px 4px 18px;
  border-top: 1px solid var(--line);
  isolation: isolate;
}
.moment-veil {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse at 18% 20%, rgba(0,210,255,.12), transparent 52%),
    radial-gradient(ellipse at 88% 80%, rgba(241,196,15,.08), transparent 46%),
    linear-gradient(180deg, transparent, rgba(13,94,66,.18));
  animation: momentBreathe 9s ease-in-out infinite;
}
.moment.night .moment-veil, .moment.evening .moment-veil, .moment.midnight .moment-veil {
  background:
    radial-gradient(ellipse at 70% 18%, rgba(180,200,255,.1), transparent 50%),
    linear-gradient(180deg, transparent, rgba(6,12,28,.45));
}
.moment.rain .moment-veil, .moment.drizzle .moment-veil, .moment.storm .moment-veil {
  background:
    radial-gradient(ellipse at 40% 0%, rgba(0,210,255,.16), transparent 55%),
    linear-gradient(180deg, transparent, rgba(8,18,28,.4));
}
.moment.dusk .moment-veil {
  background:
    radial-gradient(ellipse at 80% 30%, rgba(255,150,70,.14), transparent 50%),
    linear-gradient(180deg, transparent, rgba(40,16,8,.28));
}
@keyframes momentBreathe { 0%,100% { opacity: .85 } 50% { opacity: 1 } }
.moment-top, .moment-clock, .moment-date, .moment-wx, .moment-chips, .moment-verse { position: relative; z-index: 1; }
.moment-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.moment-kicker { font-size: 10px; letter-spacing: .22em; color: var(--luxi-cyan); }
.moment-city { font-size: 11px; color: var(--muted); letter-spacing: .08em; }
.moment-clock { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 2px; }
.moment-clock b {
  font-size: clamp(28px, 3.6vw, 42px);
  font-weight: 500;
  letter-spacing: .08em;
  font-variant-numeric: tabular-nums;
  font-family: "Songti SC", "Source Han Serif SC", Georgia, serif;
  text-shadow: 0 0 24px rgba(0,210,255,.18);
}
.moment-clock em {
  font-style: normal;
  font-size: 13px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: .12em;
}
.moment-date { font-size: 11px; color: var(--muted); letter-spacing: .1em; margin-bottom: 10px; }
.moment-wx { display: flex; align-items: center; gap: 10px; color: #cfeff6; margin-bottom: 8px; }
.moment-wx strong { display: block; font-size: 22px; font-weight: 500; letter-spacing: .04em; }
.moment-wx span { display: block; font-size: 12px; color: var(--muted); letter-spacing: .12em; }
.moment-verse { margin: 0 0 10px; }
.moment-verse p {
  margin: 0;
  font-size: clamp(14px, 1.5vw, 17px);
  line-height: 1.7;
  letter-spacing: .14em;
  color: rgba(252, 247, 236, 0.88);
  text-shadow: 0 1px 12px rgba(0,0,0,.45);
}
.moment-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.moment-chips i {
  font-style: normal;
  font-size: 10px;
  letter-spacing: .14em;
  padding: 2px 8px;
  border: 1px solid rgba(0,210,255,.28);
  border-radius: 999px;
  color: rgba(232,212,176,.85);
  background: rgba(255,255,255,.04);
}
`;

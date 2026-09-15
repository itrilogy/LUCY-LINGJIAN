import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { categoryPool, type CatalogFile, type Category } from "../../shared/catalog";
import type { Mix } from "../../shared/mixSchema";
import { fetchCatalog, fetchMix, fetchMixes, removeMix, saveMix } from "../api/client";
import { engine } from "../audio/MixEngine";
import { formatPct } from "../audio/volume";
import { BRAND } from "../brand";
import { AboutModal } from "../components/AboutModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MomentPanel } from "../components/MomentPanel";
import { toast } from "../components/Toast";
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
  const catalogStatus = useStore((s) => s.catalogStatus);
  const setCatalog = useStore((s) => s.setCatalog);
  const failCatalog = useStore((s) => s.failCatalog);
  const draft = useStore((s) => s.draft);
  const mixes = useStore((s) => s.mixes);
  const {
    addFile, addCategory, updateTrack, removeTrack, rename, setMaster,
    newMix, clearTracks, loadDraft, setMixes,
  } = useStore();
  const [openCat, setOpenCat] = useState<string>("noise");
  const [about, setAbout] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [mixesError, setMixesError] = useState<string | null>(null);
  const moment = useMoment();
  const [mixW, setMixW] = useState(() => {
    const n = Number(localStorage.getItem(MIX_W_KEY));
    return Number.isFinite(n) && n >= MIX_W_MIN ? n : MIX_W_DEFAULT;
  });
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const mixWRef = useRef(mixW);
  mixWRef.current = mixW;

  useEffect(() => {
    void fetchMixes()
      .then((list) => {
        setMixes(list);
        setMixesError(null);
      })
      .catch(() => setMixesError("无法读取已存混音"));
  }, [setMixes]);

  const files = useMemo(() => {
    if (!catalog) return [];
    return categoryPool(openCat as Category["id"], catalog.files);
  }, [catalog, openCat]);

  const saved = mixes.some((m) => m.id === draft.id);

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

  const retryCatalog = () => {
    void fetchCatalog().then(setCatalog).catch(failCatalog);
  };

  return (
    <div className="lib">
      <header className="lib-bar">
        <div className="brand-mark">
          <img src="/brand/lingjian-mark.svg" width={32} height={32} alt="" />
          <div>
            <div className="brand-title">{BRAND.nameZh}</div>
            <span className="brand-subtitle">{BRAND.nameEn} · {BRAND.code}</span>
          </div>
        </div>
        <div className="lib-bar-ops">
          <button type="button" className="btn btn-ghost" onClick={() => setAbout(true)}>关于</button>
          <button
            type="button"
            className="btn btn-secondary now-cta"
            title="按此时此刻此地的天气与时辰命中标签，随机组混音"
            disabled={!catalog}
            onClick={() => playMoment()}
          >
            此时·此刻·此地
          </button>
          <button
            type="button"
            className="btn btn-primary"
            title="按混音配置循环播放"
            disabled={!catalog || draft.tracks.length < 1}
            onClick={() => playDraft()}
          >
            开始播放
          </button>
        </div>
      </header>

      {catalogStatus === "loading" && (
        <div className="loading-state">
          <div className="spinner" aria-hidden />
          读取目录…
        </div>
      )}
      {catalogStatus === "error" && (
        <div className="error">
          <p>无法读取声音目录。</p>
          <button type="button" className="btn btn-secondary" onClick={retryCatalog}>重试</button>
        </div>
      )}

      {catalog && (
        <div className="lib-body" style={{ gridTemplateColumns: `var(--sidebar-w) minmax(0, 1fr) 6px ${mixW}px` }}>
          <aside>
            <p className="hint">{BRAND.slogan}</p>
            <p className="hint">循环混音 · 无时限 · 标签背景</p>
            <h2>场景</h2>
            {catalog.scenes.map((sc) => {
              const file = catalog.files.find((f) => f.id === sc.file_id)!;
              return (
                <div className="row" key={sc.id}>
                  <span className="row-label" title={sc.label_zh}>{sc.label_zh}</span>
                  <span className="ops">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addFile(file)}>加入</button>
                    <button type="button" className="btn btn-ghost btn-sm" title="场景单曲循环" onClick={() => goPlay(`/play/file/${file.id}`, ephemeralFileMix(file))}>播放</button>
                  </span>
                </div>
              );
            })}
            <h2>类别</h2>
            {catalog.categories.filter((c) => categoryPool(c.id, catalog.files).length > 0).map((c) => (
              <div
                className={"row" + (openCat === c.id ? " on" : "")}
                key={c.id}
                onClick={() => setOpenCat(c.id)}
              >
                <span className="row-label" title={c.label_zh}>{c.label_zh}</span>
                <span className="ops">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); addCategory(c); }}>整类</button>
                  <button type="button" className="btn btn-ghost btn-sm" title="整类随机循环" onClick={(e) => {
                    e.stopPropagation();
                    goPlay(`/play/category/${c.id}`, ephemeralCategoryMix(c));
                  }}>播放</button>
                </span>
              </div>
            ))}
            <h2>混音</h2>
            <div className="row">
              <button className="btn btn-secondary btn-full" type="button" onClick={() => newMix()}>新建混音</button>
            </div>
            <h2>已存混音</h2>
            {mixesError && (
              <p className="hint">{mixesError}</p>
            )}
            {!mixesError && mixes.length === 0 && (
              <div className="hint">
                还没有保存过。
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => newMix()}>从草稿开始</button>
              </div>
            )}
            {mixes.map((m) => (
              <div className={"row row-stack" + (m.id === draft.id ? " on" : "")} key={m.id}>
                <span className="row-label" title={m.name}>
                  {m.name}
                  <em>{m.track_count} 轨</em>
                </span>
                <span className="ops">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={async () => loadDraft(await fetchMix(m.id))}>载入</button>
                  <button type="button" className="btn btn-ghost btn-sm" title="按此混音循环播放" onClick={() => void playSaved(m.id)}>播放</button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPendingDelete({ id: m.id, name: m.name })}
                  >
                    删除
                  </button>
                </span>
              </div>
            ))}
          </aside>
          <section className="files">
            <h2>{catalog.categories.find((c) => c.id === openCat)?.label_zh} · 点选加入或单曲循环</h2>
            {files.length === 0 ? (
              <div className="empty">
                <p>这个类别没有可播文件。</p>
                <p className="note">下一步：从左侧换一个类别，或加入独立场景。</p>
              </div>
            ) : (
              <ul>
                {files.map((f) => (
                  <FileRow key={f.id} file={f} onAdd={() => addFile(f)} onPlay={() => goPlay(`/play/file/${f.id}`, ephemeralFileMix(f))} />
                ))}
              </ul>
            )}
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
              {draft.tracks.length === 0 && (
                <div className="empty" style={{ minHeight: 120, padding: 16 }}>
                  <p>从左侧加入文件、整类或独立场景。整类会在该类内随机循环，没有时限。</p>
                  <p className="note">下一步：加入音轨后点顶栏「开始播放」。</p>
                </div>
              )}
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
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateTrack(t.id, { muted: !t.muted })}>{t.muted ? "已静音" : "静音"}</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTrack(t.id)}>移除</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="actions">
                <button type="button" className="btn btn-ghost" onClick={() => newMix()}>新建混音</button>
                <button type="button" className="btn btn-ghost" disabled={draft.tracks.length < 1} onClick={() => clearTracks()}>清空音轨</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={draft.tracks.length < 1}
                  onClick={async () => {
                    try {
                      await saveMix({ ...draft, updated_at: new Date().toISOString() });
                      setMixes(await fetchMixes());
                      toast("已保存");
                    } catch {
                      toast("保存失败");
                    }
                  }}
                >
                  保存
                </button>
              </div>
            </div>
            <MomentPanel
              hit={moment.hit}
              now={moment.now}
              locating={moment.locating}
              weatherOk={moment.weatherOk}
              onPlay={catalog ? playMoment : undefined}
            />
          </section>
        </div>
      )}
      {about && <AboutModal onClose={() => setAbout(false)} />}
      {pendingDelete && (
        <ConfirmDialog
          title={`确认删除「${pendingDelete.name}」？`}
          body="此操作可从磁盘恢复。系统会把该混音目录改名为隐藏备份 data/mixes/.<id>.bak。"
          confirmLabel="删除并保留备份"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            await removeMix(id);
            setMixes(await fetchMixes());
            if (draft.id === id) newMix();
            toast("已删除，备份已保留");
          }}
        />
      )}
    </div>
  );
}

function FileRow({ file, onAdd, onPlay }: { file: CatalogFile; onAdd: () => void; onPlay: () => void }) {
  return (
    <li>
      <span>{file.label_zh}</span>
      <span className="ops">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAdd}>加入</button>
        <button type="button" className="btn btn-ghost btn-sm" title="单素材循环" onClick={onPlay}>播放</button>
      </span>
    </li>
  );
}

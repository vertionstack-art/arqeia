import { useEffect, useRef } from 'react';
import { inflateBox } from '@traco/core';
import { useEditor, visibleEntitiesIn } from './store.ts';
import { controller } from './controller.ts';
import { readTheme, renderScene, SNAP_LABEL } from './render.ts';
import { viewBox } from './viewport.ts';

/** Viewport 2D: canvas vetorial redesenhado sob demanda (requestAnimationFrame). */
export const Canvas = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    let theme = readTheme(wrap);
    let fitted = false;

    const draw = () => {
      frame = 0;
      const st = useEditor.getState();
      const p = st.project;
      if (!p) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vb = inflateBox(viewBox(st.view, controller.size), 200 / st.view.zoom);
      const preview = controller.tool?.preview();
      renderScene(ctx, {
        view: st.view,
        size: controller.size,
        entities: visibleEntitiesIn(vb),
        layers: new Map(p.layers.map((l) => [l.id, l])),
        selection: new Set(st.selection),
        hover: st.hoverId,
        highlight: new Set(preview?.highlight ?? []),
        drafts: preview?.drafts ?? [],
        guides: preview?.guides ?? [],
        snap: controller.snap,
        cursor: controller.cursorWorld,
        box: controller.box,
        gridVisible: st.gridVisible,
        units: p.settings.units,
        theme,
      });
      const tip = tipRef.current;
      if (tip) {
        if (controller.snap && controller.snap.kind !== 'grid') {
          const s = controller.screenOf(controller.snap.p);
          tip.textContent = SNAP_LABEL[controller.snap.kind];
          tip.style.transform = `translate(${s.x + 12}px, ${s.y + 10}px)`;
          tip.hidden = false;
        } else tip.hidden = true;
      }
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    controller.onRender(request);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      controller.size = { w: r.width, h: r.height };
      if (!fitted && r.width > 10) {
        fitted = true;
        controller.zoomExtents();
      }
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const unsub = useEditor.subscribe(request);
    // tema (claro/escuro/papel) pode mudar via atributo no <html>
    const mo = new MutationObserver(() => {
      theme = readTheme(wrap);
      request();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-canvas'] });

    const pos = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      if (e.button === 1) e.preventDefault();
      controller.pointerDown(pos(e), e.button, e.shiftKey);
    };
    const onMove = (e: PointerEvent) => controller.pointerMove(pos(e));
    const onUp = (e: PointerEvent) => {
      canvas.releasePointerCapture(e.pointerId);
      controller.pointerUp(pos(e), e.shiftKey);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      controller.wheel(pos(e), dy);
    };
    const onContext = (e: MouseEvent) => {
      // botão direito = Enter (padrão CAD)
      e.preventDefault();
      controller.enter();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', () => controller.leave());
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);

    return () => {
      ro.disconnect();
      mo.disconnect();
      unsub();
      controller.onRender(() => {});
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }, []);

  const tool = useEditor((s) => s.toolId);
  return (
    <div ref={wrapRef} className={`viewport tool-${tool}`} aria-label="Área de desenho 2D">
      <canvas ref={canvasRef} />
      <div ref={tipRef} className="snap-tip" hidden />
    </div>
  );
};

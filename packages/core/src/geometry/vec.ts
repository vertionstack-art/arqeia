/** Vetores 2D em coordenadas de projeto (milímetros). Y cresce para cima (convenção CAD). */
export interface Vec2 {
  x: number;
  y: number;
}

export const EPS = 1e-9;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const eq = (a: Vec2, b: Vec2, tol = 1e-6): boolean => dist(a, b) <= tol;

export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

/** Perpendicular à esquerda (rotação de +90°). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export const fromPolar = (length: number, angle: number): Vec2 => ({
  x: Math.cos(angle) * length,
  y: Math.sin(angle) * length,
});

export const rotateAround = (p: Vec2, c: Vec2, angle: number): Vec2 => {
  const s = Math.sin(angle);
  const co = Math.cos(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
};

export const scaleAround = (p: Vec2, c: Vec2, f: number): Vec2 => ({
  x: c.x + (p.x - c.x) * f,
  y: c.y + (p.y - c.y) * f,
});

/** Reflete p em relação à reta que passa por a e b. */
export const mirrorAcross = (p: Vec2, a: Vec2, b: Vec2): Vec2 => {
  const d = norm(sub(b, a));
  const ap = sub(p, a);
  const proj = add(a, mul(d, dot(ap, d)));
  return sub(mul(proj, 2), p);
};

/** Normaliza ângulo para [0, 2π). */
export const normAngle = (a: number): number => {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
};

export const deg = (rad: number): number => (rad * 180) / Math.PI;
export const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Ponto mais próximo de p no segmento ab, com o parâmetro t ∈ [0,1]. */
export const closestOnSegment = (p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } => {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { point: add(a, mul(ab, t)), t };
};

/** Projeção de p na reta infinita ab. */
export const projectOnLine = (p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } => {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return { point: a, t: 0 };
  const t = dot(sub(p, a), ab) / l2;
  return { point: add(a, mul(ab, t)), t };
};

export const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number => dist(p, closestOnSegment(p, a, b).point);

/** Verifica se o ângulo `a` está no arco anti-horário de start a end. */
export const angleInArc = (a: number, start: number, end: number): boolean => {
  const s = normAngle(start);
  const e = normAngle(end);
  const x = normAngle(a);
  if (s <= e) return x >= s - 1e-12 && x <= e + 1e-12;
  return x >= s - 1e-12 || x <= e + 1e-12;
};

/** Varredura anti-horária de start até end, em (0, 2π]. */
export const arcSweep = (start: number, end: number): number => {
  const s = normAngle(end - start);
  return s < 1e-12 ? Math.PI * 2 : s;
};

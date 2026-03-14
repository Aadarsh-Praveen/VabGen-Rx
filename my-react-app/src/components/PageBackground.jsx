import { useEffect, useRef } from "react";
import "./styles/shared-bg.css"; // adjust path as needed

const rand = (min, max) => Math.round(min + Math.random() * (max - min));

const PageBackground = () => {
  const canvasRef = useRef(null);
  const svgRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const svg    = svgRef.current;
    if (!canvas || !svg) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const NODE_COUNT = 22;

    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: i,
      x: (0.08 + Math.random() * 0.84) * W,
      y: (0.05 + Math.random() * 0.90) * H,
      dur: 12 + Math.random() * 16,
      del: -(Math.random() * 20),
    }));

    const nodeEls = nodes.map((n) => {
      const wrap = document.createElement("div");
      wrap.className = "page-node";
      wrap.style.cssText = `
        left: ${n.x}px; top: ${n.y}px;
        --dx1: ${rand(-30,30)}px; --dy1: ${rand(-25,25)}px;
        --dx2: ${rand(-30,30)}px; --dy2: ${rand(-25,25)}px;
        --dx3: ${rand(-30,30)}px; --dy3: ${rand(-25,25)}px;
        animation: node-drift ${n.dur}s ease-in-out ${n.del}s infinite;
      `;
      const dot  = document.createElement("div");
      dot.className = "page-node-dot";
      dot.style.animationDelay = `${Math.random() * -3}s`;

      const ring = document.createElement("div");
      ring.className = "page-node-ring";
      ring.style.animationDelay = `${Math.random() * -3}s`;

      wrap.appendChild(dot);
      wrap.appendChild(ring);
      canvas.appendChild(wrap);
      return wrap;
    });

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

    const lines = [];
    const MAX_DIST = W * 0.22;
    nodes.forEach((a) => {
      nodes
        .filter((b) => b.id !== a.id)
        .map((b) => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
        .forEach(({ b, d }) => {
          if (d > MAX_DIST) return;
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
          line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
          line.setAttribute("class", "page-connector");
          line.style.animationDelay = `${Math.random() * -4}s`;
          svg.appendChild(line);
          lines.push(line);
        });
    });

    return () => {
      nodeEls.forEach((el) => el.remove());
      lines.forEach((el)   => el.remove());
    };
  }, []);

  return (
    <>
      <div className="page-bg-blob page-bg-blob-1" />
      <div className="page-bg-blob page-bg-blob-2" />
      <div className="page-bg-blob page-bg-blob-3" />
      <div className="page-bg-mesh" />
      <svg  className="page-bg-svg"    ref={svgRef}    />
      <div  className="page-bg-canvas" ref={canvasRef} />
    </>
  );
};

export default PageBackground;
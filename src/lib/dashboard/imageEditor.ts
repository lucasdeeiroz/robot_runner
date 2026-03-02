
export type ToolType = "arrow" | "rect" | "crop" | null;

export interface EditorElement {
    doc_type: "image" | "arrow" | "rect" | "crop";
    x: number;
    y: number;
    w?: number;
    h?: number;
    x1?: number; // for arrow
    y1?: number; // for arrow
    x2?: number; // for arrow
    y2?: number; // for arrow
    color?: string;
    lineWidth?: number;
    img?: HTMLImageElement; // for image type
}

export function drawElement(ctx: CanvasRenderingContext2D, el: EditorElement) {
    if (el.doc_type === "image" && el.img) {
        try {
            if (el.w && el.h) {
                ctx.drawImage(el.img, el.x, el.y, el.w, el.h);
            }
        } catch (e) {
            console.error("Error drawing image element", e);
        }
        return;
    }

    // Adaptive sizing
    const baseDimension = Math.max(ctx.canvas.width, ctx.canvas.height);
    const adaptiveLineWidth = el.lineWidth || Math.max(2, Math.round(baseDimension / 150));
    const arrowHeadSize = adaptiveLineWidth * 4;

    // Apply shadow/glow for visibility on any background
    ctx.save();
    ctx.shadowBlur = adaptiveLineWidth;
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";

    if (el.doc_type === "arrow") {
        if (el.x1 === undefined || el.y1 === undefined || el.x2 === undefined || el.y2 === undefined) return;

        ctx.setLineDash([]);
        ctx.strokeStyle = el.color || "#ff0000";
        ctx.lineWidth = adaptiveLineWidth;
        ctx.beginPath();
        ctx.moveTo(el.x1, el.y1);
        ctx.lineTo(el.x2, el.y2);
        ctx.stroke();

        const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);

        ctx.beginPath();
        ctx.moveTo(el.x2, el.y2);
        ctx.lineTo(
            el.x2 - arrowHeadSize * Math.cos(angle - Math.PI / 6),
            el.y2 - arrowHeadSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            el.x2 - arrowHeadSize * Math.cos(angle + Math.PI / 6),
            el.y2 - arrowHeadSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = el.color || "#ff0000";
        ctx.fill();
    }

    if (el.doc_type === "rect") {
        if (el.w === undefined || el.h === undefined) return;

        ctx.setLineDash([]);
        ctx.strokeStyle = el.color || "#0088ff";
        ctx.lineWidth = adaptiveLineWidth;
        ctx.strokeRect(el.x, el.y, el.w, el.h);
    }

    if (el.doc_type === "crop") {
        if (el.w === undefined || el.h === undefined) return;

        ctx.strokeStyle = "#4ade80"; // Success color for crop
        ctx.lineWidth = Math.max(2, Math.round(adaptiveLineWidth / 1.5));
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(el.x, el.y, el.w, el.h);
        ctx.setLineDash([]);
    }

    ctx.restore();
}

export function redrawCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, elements: EditorElement[]) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    elements.forEach(el => drawElement(ctx, el));
}

export function getMousePos(canvasEl: HTMLCanvasElement, evt: React.MouseEvent | MouseEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY,
    };
}

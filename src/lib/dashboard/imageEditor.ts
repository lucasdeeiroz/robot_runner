
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
        // Safety: Ensure image is loaded? usually yes if stored in element
        try {
            if (el.w && el.h) {
                ctx.drawImage(el.img, el.x, el.y, el.w, el.h);
            }
        } catch (e) {
            console.error("Error drawing image element", e);
        }
        return;
    }

    if (el.doc_type === "arrow") {
        if (el.x1 === undefined || el.y1 === undefined || el.x2 === undefined || el.y2 === undefined) return;

        ctx.setLineDash([]);
        ctx.strokeStyle = el.color || "red";
        ctx.lineWidth = el.lineWidth || 3;
        ctx.beginPath();
        ctx.moveTo(el.x1, el.y1);
        ctx.lineTo(el.x2, el.y2);
        ctx.stroke();

        const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
        const size = 12; // slightly larger for visibility

        ctx.beginPath();
        ctx.moveTo(el.x2, el.y2);
        ctx.lineTo(
            el.x2 - size * Math.cos(angle - Math.PI / 6),
            el.y2 - size * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            el.x2 - size * Math.cos(angle + Math.PI / 6),
            el.y2 - size * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = el.color || "red";
        ctx.fill();
        return;
    }

    if (el.doc_type === "rect") {
        if (el.w === undefined || el.h === undefined) return;

        ctx.setLineDash([]);
        ctx.strokeStyle = el.color || "blue";
        ctx.lineWidth = el.lineWidth || 3;
        ctx.strokeRect(el.x, el.y, el.w, el.h);
        return;
    }

    if (el.doc_type === "crop") {
        if (el.w === undefined || el.h === undefined) return;

        ctx.strokeStyle = "#22c55e"; // Success color for crop
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(el.x, el.y, el.w, el.h);
        ctx.setLineDash([]);
        return;
    }
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

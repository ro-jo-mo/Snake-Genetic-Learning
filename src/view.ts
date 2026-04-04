// Handles presenting the game and user inputs
import type { Vec2 } from "./snake";

const COLOURS = {
    apple: "#ef476f",
    snakeUpper: "#06d6a0",
    snakeLower: "#048B67",
    grid: "#ef476e6b",
} as const;

export class View {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private scoreText: HTMLElement;
    private messageText: HTMLElement;
    private aiButton: HTMLElement;
    private highScoreText: HTMLElement;
    private cellSize = 50;
    private table: HTMLElement;

    constructor(width: number, height: number) {
        this.table = document.getElementById("spectate-table-body")!;
        this.canvas = document.getElementById(
            "game-canvas",
        ) as HTMLCanvasElement;
        this.context = this.canvas.getContext("2d")!;
        this.scoreText = document.getElementById("score")!;
        this.highScoreText = document.getElementById("high-score")!;
        this.messageText = document.getElementById("message")!;
        this.aiButton = document.getElementById("ai-button")!;
        this.canvas.width = width * this.cellSize;
        this.canvas.height = height * this.cellSize;
        const panel = document.getElementById("spectate-panel")!;
        panel.style.maxHeight = this.canvas.height + "px";
    }

    public drawMessage(msg: string): void {
        this.messageText.textContent = msg;
    }

    public drawHighScore(score: number): void {
        this.highScoreText.textContent = score.toString();
    }

    public draw(
        snake: Vec2[],
        head: number,
        direction: Vec2,
        apple: Vec2,
        score: number,
    ): void {
        this.messageText.textContent = "";
        this.clear();

        this.drawGrid();
        this.drawSnake(snake, head, direction);
        this.drawApple(apple);

        this.scoreText.textContent = score.toString();
    }

    public clear(): void {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private drawSnake(snake: Vec2[], head: number, direction: Vec2): void {
        for (let i = 0; i < snake.length; i++) {
            let duration = head - i;

            if (i > head) {
                duration += snake.length;
            }

            duration /= snake.length - 1;

            this.context.fillStyle = this.colourInterpolate(
                COLOURS.snakeUpper,
                COLOURS.snakeLower,
                duration,
            );
            this.drawCell(snake[i], 8 + 12 * duration);
        }

        let { x, y } = snake[head];
        x *= this.cellSize;
        y *= this.cellSize;
        x += this.cellSize / 2;
        y += this.cellSize / 2;

        this.context.fillStyle = "#000000";

        const offset = this.cellSize * 0.2;
        const forwardOffset = this.cellSize * 0.1;
        const radius = this.cellSize * 0.1;

        let left: Vec2;
        let right: Vec2;

        if (direction.x === 0) {
            const sign = Math.sign(direction.y);
            left = { x: x - offset, y: y + sign * forwardOffset };
            right = { x: x + offset, y: y + sign * forwardOffset };
        } else {
            const sign = Math.sign(direction.x);
            left = { x: x + sign * forwardOffset, y: y - offset };
            right = { x: x + sign * forwardOffset, y: y + offset };
        }
        this.context.beginPath();
        this.context.arc(left.x, left.y, radius, 0, Math.PI * 2);
        this.context.fill();
        this.context.beginPath();
        this.context.arc(right.x, right.y, radius, 0, Math.PI * 2);
        this.context.fill();
    }

    private drawApple(apple: Vec2): void {
        this.context.fillStyle = COLOURS.apple;
        this.drawCell(apple, 16);
    }

    private drawGrid(): void {
        const ctx = this.context;
        ctx.strokeStyle = COLOURS.grid;
        ctx.lineWidth = 1.5;
        for (let i = 0; i <= this.canvas.width / this.cellSize + 0.01; i++) {
            ctx.beginPath();
            ctx.moveTo(i * this.cellSize, 0);
            ctx.lineTo(i * this.cellSize, this.canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= this.canvas.height / this.cellSize + 0.01; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * this.cellSize);
            ctx.lineTo(this.canvas.width, i * this.cellSize);
            ctx.stroke();
        }
    }

    private drawCell(cell: Vec2, rounding: number): void {
        const pad = 2;
        this.context.beginPath();
        this.context.roundRect(
            cell.x * this.cellSize + pad,
            cell.y * this.cellSize + pad,
            this.cellSize - pad * 2,
            this.cellSize - pad * 2,
            rounding,
        );
        this.context.fill();
    }

    private colourInterpolate(
        colourA: string,
        colourB: string,
        t: number,
    ): string {
        const [r1, g1, b1] = this.hexToRgb(colourA);
        const [r2, g2, b2] = this.hexToRgb(colourB);

        return this.rgbToHex(
            r1 + (r2 - r1) * t,
            g1 + (g2 - g1) * t,
            b1 + (b2 - b1) * t,
        );
    }

    private hexToRgb(hex: string): [number, number, number] {
        const n = parseInt(hex.replace("#", ""), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    private rgbToHex(r: number, g: number, b: number): string {
        return (
            "#" +
            [r, g, b]
                .map((v) => Math.round(v).toString(16).padStart(2, "0"))
                .join("")
        );
    }

    public drawScoreBoard(
        names: string[],
        scores: number[],
        dead: boolean[],
        spectating: number,
    ): void {
        this.table.innerHTML = "";

        for (let i = 0; i < names.length; i++) {
            const row = document.createElement("tr");

            if (dead[i]) {
                row.classList.add("dead");
            }
            if (i === spectating) {
                row.classList.add("selected");
            }

            const name = document.createElement("td");
            name.textContent = names[i];

            const score = document.createElement("td");
            score.textContent = scores[i].toString();

            const status = document.createElement("td");
            status.textContent = dead[i] ? "Dead" : "Alive";
            status.className = dead[i] ? "status-dead" : "status-alive";

            row.append(name, score, status);

            this.table.appendChild(row);
        }
    }

    public toggleTrainButton(bool: boolean): void {
        const ele = document.getElementById("train-button")!;
        if (bool) {
            ele.className = "training-on";
            ele.textContent = "Stop";
        } else {
            ele.className = "training-off";
            ele.textContent = "Train";
        }
    }
}

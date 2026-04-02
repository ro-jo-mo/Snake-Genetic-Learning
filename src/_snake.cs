// --- Types & Interfaces ---

interface Point {
  x: number;
  y: number;
}

enum Direction {
  Up = "UP",
  Down = "DOWN",
  Left = "LEFT",
  Right = "RIGHT",
}

type GameState = "idle" | "running" | "paused" | "over";

// --- Constants ---

const GRID_SIZE = 20;
const CELL_SIZE = 24;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const TICK_MS = 130;

// --- Game Logic ---

class SnakeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private snake: Point[] = [];
  private food: Point = { x: 0, y: 0 };
  private direction: Direction = Direction.Right;
  private nextDirection: Direction = Direction.Right;
  private state: GameState = "idle";
  private score: number = 0;
  private intervalId: number | null = null;
  private scoreEl: HTMLElement;
  private messageEl: HTMLElement;

  constructor() {
    this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.scoreEl = document.getElementById("score")!;
    this.messageEl = document.getElementById("message")!;

    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;

    document.addEventListener("keydown", (e) => this.handleKey(e));
    document.getElementById("start-btn")!.addEventListener("click", () => this.start());

    this.drawIdle();
  }

  private start(): void {
    if (this.intervalId !== null) clearInterval(this.intervalId);
  
    const mid = Math.floor(GRID_SIZE / 2);
    this.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    this.direction = Direction.Right;
    this.nextDirection = Direction.Right;
    this.score = 0;
    this.state = "running";
    this.spawnFood();
    this.updateScore();
    this.messageEl.textContent = "";
    this.intervalId = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (this.state !== "running") return;

    this.direction = this.nextDirection;
    const head = this.snake[0];
    const newHead = this.move(head, this.direction);

    // Wall collision
    if (
      newHead.x < 0 || newHead.x >= GRID_SIZE ||
      newHead.y < 0 || newHead.y >= GRID_SIZE
    ) {
      this.gameOver();
      return;
    }

    // Self collision
    if (this.snake.some((p) => p.x === newHead.x && p.y === newHead.y)) {
      this.gameOver();
      return;
    }

    this.snake.unshift(newHead);

    // Eat food
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score++;
      this.updateScore();
      this.spawnFood();
    } else {
      this.snake.pop();
    }

    this.draw();
  }

  private move(point: Point, dir: Direction): Point {
    const moves: Record<Direction, Point> = {
      [Direction.Up]:    { x: point.x,     y: point.y - 1 },
      [Direction.Down]:  { x: point.x,     y: point.y + 1 },
      [Direction.Left]:  { x: point.x - 1, y: point.y     },
      [Direction.Right]: { x: point.x + 1, y: point.y     },
    };
    return moves[dir];
  }

  private spawnFood(): void {
    const occupied = new Set(this.snake.map((p) => `${p.x},${p.y}`));
    let candidate: Point;
    do {
      candidate = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (occupied.has(`${candidate.x},${candidate.y}`));
    this.food = candidate;
  }

  private handleKey(e: KeyboardEvent): void {
    const opposites: Record<Direction, Direction> = {
      [Direction.Up]:    Direction.Down,
      [Direction.Down]:  Direction.Up,
      [Direction.Left]:  Direction.Right,
      [Direction.Right]: Direction.Left,
    };

    const keyMap: Record<string, Direction> = {
      ArrowUp: Direction.Up,
      ArrowDown: Direction.Down,
      ArrowLeft: Direction.Left,
      ArrowRight: Direction.Right,
      w: Direction.Up,
      s: Direction.Down,
      a: Direction.Left,
      d: Direction.Right,
    };

    const newDir = keyMap[e.key];
    if (newDir && newDir !== opposites[this.direction]) {
      this.nextDirection = newDir;
      e.preventDefault();
    }

    if (e.key === " ") {
      if (this.state === "running") {
        this.state = "paused";
        this.messageEl.textContent = "Paused — press Space to resume";
      } else if (this.state === "paused") {
        this.state = "running";
        this.messageEl.textContent = "";
      }
    }
  }

  private gameOver(): void {
    this.state = "over";
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.messageEl.textContent = `Game Over! Score: ${this.score} — click Start to play again`;
    this.draw();
  }

  private updateScore(): void {
    this.scoreEl.textContent = String(this.score);
  }

  // --- Drawing ---

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.drawGrid();
    this.drawFood();
    this.drawSnake();
  }

  private drawIdle(): void {
    this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.drawGrid();
    this.messageEl.textContent = "Press Start to play";
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }
  }

  private drawSnake(): void {
    const ctx = this.ctx;
    this.snake.forEach((segment, i) => {
      const alpha = i === 0 ? 1 : Math.max(0.4, 1 - i * 0.03);
      ctx.fillStyle = i === 0 ? `rgba(74, 222, 128, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
      this.fillCell(segment);

      // Eyes on the head
      if (i === 0) {
        ctx.fillStyle = "#0f172a";
        const [ex1, ey1, ex2, ey2] = this.eyePositions(segment);
        ctx.beginPath();
        ctx.arc(ex1, ey1, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2, ey2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  private eyePositions(head: Point): [number, number, number, number] {
    const cx = head.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = head.y * CELL_SIZE + CELL_SIZE / 2;
    const o = CELL_SIZE * 0.22;
    switch (this.direction) {
      case Direction.Right: return [cx + 5, cy - o, cx + 5, cy + o];
      case Direction.Left:  return [cx - 5, cy - o, cx - 5, cy + o];
      case Direction.Up:    return [cx - o, cy - 5, cx + o, cy - 5];
      case Direction.Down:  return [cx - o, cy + 5, cx + o, cy + 5];
    }
  }

  private drawFood(): void {
    this.ctx.fillStyle = "#f87171";
    this.fillCell(this.food);
    // Small shine dot
    this.ctx.fillStyle = "rgba(255,255,255,0.5)";
    this.ctx.beginPath();
    this.ctx.arc(
      this.food.x * CELL_SIZE + CELL_SIZE * 0.35,
      this.food.y * CELL_SIZE + CELL_SIZE * 0.3,
      2, 0, Math.PI * 2
    );
    this.ctx.fill();
  }

  private fillCell({ x, y }: Point): void {
    const pad = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(
      x * CELL_SIZE + pad,
      y * CELL_SIZE + pad,
      CELL_SIZE - pad * 2,
      CELL_SIZE - pad * 2,
      4
    );
    this.ctx.fill();
  }
}

// Boot
new SnakeGame();

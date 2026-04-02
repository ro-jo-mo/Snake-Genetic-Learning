export interface Vec2 {
    x: number;
    y: number;
}

export class SnakeGame {
    private width: number;
    private height: number;
    private snake: Vec2[] = [];
    private direction: Vec2 = { x: 1, y: 0 };
    private head = 0;
    private tail = 0;
    private score = 0;
    private apple: Vec2 = { x: 0, y: 0 };
    public timer = 0;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.createSnake();
        this.spawnApple();
    }

    private createSnake(): void {
        // Assume we can make a snake of length 3
        const x = Math.floor(this.width / 2);
        const y = Math.floor(this.height / 2);

        for (let i = -1; i < 2; i++) {
            this.snake.push({ x: x + i, y: y });
        }

        this.head = 2;
        this.tail = 0;
    }

    private spawnApple(): void {
        do {
            this.apple = {
                x: Math.floor(Math.random() * this.width),
                y: Math.floor(Math.random() * this.height),
            };
        } while (
            this.snake.some(
                (pos) => pos.x === this.apple.x && pos.y === this.apple.y,
            )
        );
    }

    public moveSnake(): void {
        this.timer++;
        const head = this.snake[this.head];
        const nextPosition = {
            x: head.x + this.direction.x,
            y: head.y + this.direction.y,
        };
        // snake ate food
        if (
            nextPosition.x === this.apple.x &&
            nextPosition.y === this.apple.y
        ) {
            this.score++;
            this.spawnApple();
            this.snake.splice(this.tail + 1, 0, this.snake[this.tail]);
        }

        this.snake[this.tail] = nextPosition;
        [this.head, this.tail] = [
            this.tail,
            (this.tail + 1) % this.snake.length,
        ];
    }

    private boundsCheck(): boolean {
        // Check just the head is inside
        const head = this.snake[this.head];
        return (
            head.x >= this.width ||
            head.y >= this.height ||
            head.x < 0 ||
            head.y < 0
        );
    }

    private selfCollisionCheck(): boolean {
        const head = this.snake[this.head];
        for (let i = 0; i < this.snake.length; i++) {
            if (i === this.head) {
                continue;
            }
            if (this.snake[i].x === head.x && this.snake[i].y === head.y) {
                return true;
            }
        }
        return false;
    }

    public setDirection(newDirection: Vec2): void {
        if (
            newDirection.x === -this.direction.x ||
            newDirection.y === -this.direction.y
        ) {
            return;
        }
        this.direction = newDirection;
    }

    public snakeDied(): boolean {
        if (this.boundsCheck()) {
            console.log("Bound checked!!");
        }
        if (this.selfCollisionCheck()) {
            console.log("self collision checked!!");
        }
        return this.boundsCheck() || this.selfCollisionCheck();
    }

    public getDirection(): Vec2 {
        return this.direction;
    }

    public getHead(): number {
        return this.head;
    }

    public getSnake(): Vec2[] {
        return this.snake;
    }

    public getApple(): Vec2 {
        return this.apple;
    }

    public getScore(): number {
        return this.score;
    }
}

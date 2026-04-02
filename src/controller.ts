// mvc controller
import { SnakeGame } from "./snake.js";
import { View } from "./view.js";
import type { Vec2 } from "./snake.js";

export class Controller {
    private view: View;
    private game: SnakeGame;
    private width = 15;
    private height = 15;
    private inputBuffer: KeyboardEvent[] = [];
    private tickRate = 180;
    private pause = true;
    private aiOn = true;
    private currentInterval = 0;

    constructor() {
        this.view = new View(this.width, this.height);
        this.game = new SnakeGame(this.width, this.height);
        document.addEventListener("keydown", (e) => this.bufferInput(e));
        document
            .getElementById("ai-button")!
            .addEventListener("click", () => this.aiToggle());
    }

    public start(): void {
        this.drawGame();
        this.currentInterval = window.setInterval(
            () => this.tick(),
            this.tickRate,
        );
    }

    public startAi(): void {
        this.drawGame();
    }

    private tick(): void {
        const key = this.inputBuffer.shift();
        if (key) {
            this.pause = this.handleInput(key);
        }

        if (this.pause) {
            this.view.drawMessage("Game is paused\nAny key to resume");
            return;
        }

        this.game.moveSnake();
        if (this.game.snakeDied()) {
            this.inputBuffer = [];
            this.view.drawMessage("You died! Game over!\nAny key to restart");
            clearInterval(this.currentInterval);
            this.restartGame();
            setTimeout(() => this.start(), 1000);
            this.pause = true;
            return;
        }
        this.drawGame();
    }

    private aiToggle(): void {
        this.restartGame();
        window.clearInterval(this.currentInterval);

        if (this.aiOn) {
            this.view.drawAiToggle("User");
            this.start();
        } else {
            this.view.drawAiToggle("AI");
            this.startAi();
        }

        this.aiOn = !this.aiOn;
    }

    private restartGame() {
        this.game = new SnakeGame(this.width, this.height);
    }

    private drawGame(): void {
        this.view.draw(
            this.game.getSnake(),
            this.game.getHead(),
            this.game.getDirection(),
            this.game.getApple(),
            this.game.getScore(),
        );
    }

    private bufferInput(e: KeyboardEvent): void {
        //  maintain a buffer of up to 2 inputs
        // anymore is probably annoying
        switch (this.inputBuffer.length) {
            // if buffer has space, push as usual
            case 0:
            case 1:
                this.inputBuffer.push(e);
                break;
            case 2:
                break;
            default:
                throw Error("I screwed up somewhere in input buffer");
        }
    }

    private handleInput(e: KeyboardEvent): boolean {
        let direction: Vec2;
        switch (e.key) {
            case "w":
                direction = { x: 0, y: -1 };
                this.game.setDirection(direction);
                break;
            case "s":
                direction = { x: 0, y: 1 };
                this.game.setDirection(direction);
                break;
            case "a":
                direction = { x: -1, y: 0 };
                this.game.setDirection(direction);
                break;
            case "d":
                direction = { x: 1, y: 0 };
                this.game.setDirection(direction);
                break;
            case " ":
            case "Escape":
            default:
                return true;
        }
        return false;
    }
}

// mvc controller
import { SnakeGame } from "./snake";
import { View } from "./view";
import { Trainer } from "./ai";
import type { Vec2 } from "./snake";

export class Controller {
    private view: View;
    private game: SnakeGame;
    private width = 15;
    private height = 15;
    private inputBuffer: KeyboardEvent[] = [];
    private tickRate = 180;
    private pause = true;
    private highScore: number;
    private table: HTMLElement;
    private spectating = 0;
    private currentInterval = 0;
    private tablePopulated = false;
    private training = false;

    constructor() {
        this.view = new View(this.width, this.height);
        this.game = new SnakeGame(this.width, this.height);
        this.highScore = this.loadHighScore();
        this.table = document.getElementById("spectate-table-body")!;

        document.addEventListener("keydown", (e) => this.bufferInput(e));

        document.getElementById("layer-add")!.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "number";
            input.className = "layer-input";
            input.value = "64";
            input.min = "1";
            document.getElementById("layer-inputs")!.appendChild(input);
        });

        document
            .getElementById("layer-remove")!
            .addEventListener("click", () => {
                const container = document.getElementById("layer-inputs")!;
                if (container.children.length > 1) {
                    container.removeChild(container.lastElementChild!);
                }
            });

        document
            .getElementById("train-button")!
            .addEventListener("click", () => {
                this.startAi();
            });
    }

    public start(): void {
        this.drawGame(this.game);
        this.currentInterval = window.setInterval(
            () => this.tick(),
            this.tickRate,
        );
    }

    public async startAi(): Promise<void> {
        this.training = !this.training;

        this.view.toggleTrainButton(this.training);

        clearInterval(this.currentInterval);

        if (!this.training) {
            return;
        }

        const s = this.getAiSettings();

        this.game = new SnakeGame(this.width, this.height);
        const trainer = new Trainer(
            s.population,
            s.keepTopK,
            s.perturbationFrequency,
            s.perturbationMagnitude,
            s.gameWidth,
            s.gameHeight,
            s.layerSizes,
        );
        this.spectating = 0;

        this.drawGame(this.game);

        while (this.training) {
            console.log("Running next training iteration");
            this.tablePopulated = false;
            await trainer.train((names, games) =>
                this.aiCallback(names, games),
            );
        }
    }

    private getAiSettings() {
        const get = (id: string) =>
            (document.getElementById(id) as HTMLInputElement).value;

        let layers = Array.from(
            document.querySelectorAll<HTMLInputElement>(".layer-input"),
            (el) => parseInt(el.value),
        );

        return {
            population: parseInt(get("ai-population")),
            keepTopK: parseInt(get("ai-keep-top-k")),
            perturbationFrequency: parseFloat(get("ai-perturb-freq")),
            perturbationMagnitude: parseFloat(get("ai-perturb-mag")),
            gameWidth: 15,
            gameHeight: 15,
            layerSizes: layers,
        };
    }

    private aiCallback(names: string[], games: SnakeGame[]): void {
        if (!this.tablePopulated) {
            this.view.drawScoreBoard(
                names,
                games.map((game) => game.getScore()),
                games.map((game) => game.snakeDied()),
                this.spectating,
            );

            for (let i = 0; i < names.length; i++) {
                this.table.children[i].addEventListener("click", () => {
                    this.table.children[this.spectating].classList.remove(
                        "selected",
                    );
                    this.spectating = i;
                    this.table.children[this.spectating].classList.add(
                        "selected",
                    );
                    this.drawGame(games[i]);
                });
            }
            this.tablePopulated = true;
        }

        this.drawGame(games[this.spectating]);
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

        if (this.game.getScore() > this.highScore) {
            this.highScore = this.game.getScore();
            this.view.drawHighScore(this.highScore);
            this.saveHighScore();
        }

        if (this.game.snakeDied()) {
            console.log(`TIME : ${this.game.timer}`);
            this.inputBuffer = [];
            this.view.drawMessage("You died! Game over!\nAny key to restart");
            clearInterval(this.currentInterval);
            this.restartGame();
            setTimeout(() => this.start(), 2000);
            this.pause = true;

            return;
        }
        this.drawGame(this.game);
    }

    private restartGame() {
        this.game = new SnakeGame(this.width, this.height);
    }

    private drawGame(game: SnakeGame): void {
        this.view.draw(
            game.getSnake(),
            game.getHead(),
            game.getDirection(),
            game.getApple(),
            game.getScore(),
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

    private loadHighScore(): number {
        return parseInt(localStorage.getItem("highScore") ?? "0");
    }
    private saveHighScore(): void {
        localStorage.setItem("highScore", this.highScore.toString());
    }
}

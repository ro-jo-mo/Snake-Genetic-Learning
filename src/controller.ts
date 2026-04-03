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
    private highScore = 0;

    private spectateIndex = 0;
    private currentInterval = 0;

    constructor() {
        this.view = new View(this.width, this.height);
        this.game = new SnakeGame(this.width, this.height);
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
        this.drawGame();
        this.currentInterval = window.setInterval(
            () => this.tick(),
            this.tickRate,
        );
    }

    public async startAi(): Promise<void> {
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
        this.spectateIndex = 0;
        this.drawGame();

        await trainer.train((names, games) => this.aiCallback(names, games));
    }

    private getAiSettings() {
        const get = (id: string) =>
            (document.getElementById(id) as HTMLInputElement).value;

        let layers = Array.from(
            document.querySelectorAll<HTMLInputElement>(".layer-input"),
            (el) => parseInt(el.value),
        );

        // add output layer
        layers.push(4);

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
        return;

        const tbody = document.getElementById("spectate-tbody")!;
        tbody.innerHTML = "";

        games.forEach((game, i) => {
            const dead = game.snakeDied();
            const row = document.createElement("tr");
            if (dead) row.classList.add("dead");
            if (i === this.spectateIndex) row.classList.add("selected");

            const nameTd = document.createElement("td");
            nameTd.textContent = names[i];

            const scoreTd = document.createElement("td");
            scoreTd.textContent = game.getScore().toString();

            const statusTd = document.createElement("td");
            statusTd.textContent = dead ? "Dead" : "Alive";
            statusTd.className = dead ? "status-dead" : "status-alive";

            row.append(nameTd, scoreTd, statusTd);
            row.addEventListener("click", () => {
                this.spectateIndex = i;
            });
            tbody.appendChild(row);
        });

        if (this.spectateIndex !== null) {
            const game = games[this.spectateIndex];
            this.view.draw(
                game.getSnake(),
                game.getHead(),
                game.getDirection(),
                game.getApple(),
                game.getScore(),
            );
        }
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
        }

        if (this.game.snakeDied()) {
            this.inputBuffer = [];
            this.view.drawMessage("You died! Game over!\nAny key to restart");
            clearInterval(this.currentInterval);
            this.restartGame();
            setTimeout(() => this.start(), 2000);
            this.pause = true;

            return;
        }
        this.drawGame();
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

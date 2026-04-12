import Names from "../names";
import { SnakeGame, Vec2 } from "../snake";
import { Model } from "./model";

type ModelFitness = { model: Model; fitness: number };

export class Trainer {
    private population: Model[];
    private numModelsKept: number;

    private perturbationFrequency: number;
    private perturbationMagnitude: number;

    private gameWidth: number;
    private gameHeight: number;

    private inputSize: number;

    private topKModels: ModelFitness[];
    private workers: Worker[];

    private static timeout = 1000;

    constructor(
        population: number,
        keepTopK: number,
        perturbationFrequency: number,
        perturbationMagnitude: number,
        gameWidth: number,
        gameHeight: number,
        layerSizes: number[],
    ) {
        this.numModelsKept = keepTopK;
        this.perturbationFrequency = perturbationFrequency;
        this.perturbationMagnitude = perturbationMagnitude;
        this.gameHeight = gameHeight;
        this.gameWidth = gameWidth;
        this.inputSize = gameWidth * gameHeight + 6;

        this.population = Array.from({ length: population }, () =>
            Model.fromLayerSizes(this.inputSize, layerSizes),
        );

        // assign dummy values to top k for now
        this.topKModels = Array(keepTopK).fill({
            model: this.population[0],
            fitness: 0,
        });

        const cores = navigator.hardwareConcurrency;
        this.workers = Array.from(
            { length: cores - 1 },
            () =>
                new Worker(new URL("./worker.ts", import.meta.url), {
                    type: "module",
                }),
        );
    }

    public async train(
        callback: (names: string[], games: SnakeGame[]) => void,
    ): Promise<void> {
        console.log("Training starts");

        let fitnesses = await this.runPopulation(callback);

        console.log("Fitnesses gathered");

        let sorted = this.population
            .map((model, i) => ({ model, fitness: fitnesses[i] }))
            .sort((a, b) => b.fitness - a.fitness);

        // There is zero reason to re run the top k each iteration
        // Simply store them separately
        this.updateTopK(sorted);

        let nextGeneration: Model[] = [];
        // Mutate top k with random selection
        let i = 0;

        console.log("Mutating models");
        while (nextGeneration.length < this.population.length) {
            // some biasing towards more performant models
            // this looks somewhat stupid but does work

            let index = [Math.random(), Math.random(), Math.random()].sort()[0];

            index = Math.floor(this.population.length * index);

            nextGeneration.push(
                Model.merge(
                    this.topKModels[i].model,
                    sorted[index].model,
                    this.perturbationFrequency,
                    this.perturbationMagnitude,
                ),
            );
            i++;
            i %= this.numModelsKept;
        }
        console.log(`Highest Fitness: ${sorted[0].fitness}`);
        this.population = nextGeneration;
    }

    private updateTopK(models: ModelFitness[]): void {
        this.topKModels = this.topKModels.concat(
            models.slice(0, this.numModelsKept),
        );
        this.topKModels.sort((a, b) => b.fitness - a.fitness);
        this.topKModels = this.topKModels.slice(0, this.numModelsKept);
    }

    private async runPopulation(
        callback: (names: string[], games: SnakeGame[]) => void,
    ): Promise<number[]> {
        const cores = navigator.hardwareConcurrency;

        const batchSize = this.population.length / cores;
        let promises: Promise<number[]>[] = [];

        console.log("Starting workers");
        // Start by creating new worker threads to run training
        for (let i = 0; i < this.workers.length; i++) {
            const batch = this.population.slice(
                Math.ceil(batchSize * i),
                Math.ceil(batchSize * (i + 1)),
            );

            const promise = new Promise<number[]>((resolve) => {
                this.workers[i].postMessage({
                    batch,
                    width: this.gameWidth,
                    height: this.gameHeight,
                });
                this.workers[i].onmessage = (e) => {
                    resolve(e.data.fitnesses);
                };
            });

            promises.push(promise);
        }

        // As sending data between workers is slow, we keep the main thread for a visualisation
        const batch = this.population.slice(Math.ceil((cores - 1) * batchSize));

        let games = Array.from(
            { length: batch.length },
            () => new SnakeGame(this.gameWidth, this.gameHeight),
        );
        // AFter each training step, return data to ui
        console.log("Starting main thread");

        let timeout = Trainer.timeout;
        while (!games.every((game) => game.snakeDied())) {
            Trainer.runModelsOneStep(
                batch,
                games,
                this.gameWidth,
                this.gameHeight,
            );
            callback(
                batch.map((model) => model.name),
                games,
            );

            timeout--;
            if (timeout < 0) {
                break;
            }
            // await new Promise((r) => setTimeout(r, 100));
        }

        const fitnesses = await Promise.all(promises);

        fitnesses.push(games.map((game) => Trainer.fitness(game)));
        return fitnesses.flat();
    }

    public static runModel(
        model: Model,
        width: number,
        height: number,
    ): number {
        let game = new SnakeGame(width, height);

        // too lazy to make this a param
        let timeout = Trainer.timeout;
        while (!game.snakeDied()) {
            const encoding = Trainer.encodeGame(game, width, height);
            const decision = Trainer.getDecisionFromModel(model, encoding);
            game.setDirection(decision);
            game.moveSnake();
            timeout--;
            if (timeout < 0) {
                break;
            }
        }

        return Trainer.fitness(game);
    }

    private static runModelsOneStep(
        models: Model[],
        games: SnakeGame[],
        width: number,
        height: number,
    ): void {
        for (let i = 0; i < games.length; i++) {
            if (!games[i].snakeDied()) {
                const encoding = Trainer.encodeGame(games[i], width, height);
                const decision = Trainer.getDecisionFromModel(
                    models[i],
                    encoding,
                );
                games[i].setDirection(decision);
                games[i].moveSnake();
            }
        }
    }

    private static fitness(game: SnakeGame): number {
        // It is incredibly trivial to write a snake ai that can reach the maximum possible score
        // I do not care about this objective
        // I am mostly interested in getting a good score in a reasonable amount of time
        const score = game.getScore();
        const time = game.timer;
        return score + (5 * score) / time ** 2;
    }

    private static getDecisionFromModel(
        model: Model,
        encoding: Float32Array,
    ): Vec2 {
        // Originally I was going to do 3 outputs, forwards, turn left, turn right
        // This likely would confuse things for the model
        // So instead I have opted for 4, with the caveat that one will simply not work
        // as it can't do a 180 on itself
        const output = model.execute(encoding);
        let greatest = 0;
        for (let i = 1; i < 4; i++) {
            if (output[i] > output[greatest]) {
                greatest = i;
            }
        }

        switch (greatest) {
            case 0:
                return { x: 0, y: 1 };
            case 1:
                return { x: 0, y: -1 };
            case 2:
                return { x: 1, y: 0 };
            case 3:
                return { x: -1, y: 0 };
            default:
                throw Error("I screwed up model outputs or something??");
        }
    }

    private static encodeGame(
        game: SnakeGame,
        width: number,
        height: number,
    ): Float32Array {
        // Requirements for the input:
        // The full game board, encoding the number of moves before the square will be empty
        // i.e. 0 is empty now, 1 will be empty in 1 turn ...
        // x y of the apple
        // x y of the current snake direction
        // x y of snake head
        const offset = height * width;
        let encoding = new Float32Array(offset + 6);

        // convert 2d coord to 1d
        const convert = (pos: Vec2) => pos.x + pos.y * width;

        const headIndex = game.getHead();
        const snake = game.getSnake();

        for (let i = 0; i < snake.length; i++) {
            let duration = headIndex - i;

            if (i > headIndex) {
                duration += snake.length;
            }
            duration = snake.length - duration;

            encoding[convert(snake[i])] = duration;
        }

        const apple = game.getApple();
        const direction = game.getDirection();
        const head = snake[headIndex];

        encoding[offset] = apple.x;
        encoding[offset + 1] = apple.y;
        encoding[offset + 2] = direction.x;
        encoding[offset + 3] = direction.y;
        encoding[offset + 4] = head.x;
        encoding[offset + 5] = head.y;

        return encoding;
    }

    private gradientDescent(model: Model): void {
        // repeat until model has 100% training accuracy
        // this is a basic requirement of any model
        // training data only includes scenarios where there is a single possible answer

        const games: Float32Array[] = [];
        const labels: Float32Array[] = [];

        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            const label = labels[i];

            const gradients = model.backpropagation(game, label);
        }
    }
}

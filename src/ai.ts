import Names from "./names";
import { SnakeGame, Vec2 } from "./snake";

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

        // add output layer
        layerSizes.push(4);

        this.population = Array.from({ length: population }, () =>
            Model.fromLayerSizes(this.inputSize, layerSizes),
        );

        // assign dummy values to top k for now
        this.topKModels = Array(keepTopK).fill({
            model: this.population[0],
            fitness: 0,
        });
    }

    public async train(callback: (games: SnakeGame[]) => void): Promise<void> {
        let fitnesses = await this.runPopulation(callback);

        let sorted = this.population
            .map((model, i) => ({ model, fitness: fitnesses[i] }))
            .sort((a, b) => b.fitness - a.fitness);

        // There is zero reason to re run the top k each iteration
        // Simply store them separately
        this.updateTopK(sorted);

        let nextGeneration: Model[] = [];
        // Mutate top k with random selection
        let i = 0;
        while (nextGeneration.length < this.population.length) {
            // some biasing towards more performant models
            // this looks somewhat stupid but does work

            let index = [Math.random(), Math.random(), Math.random()]
                .sort()
                .shift();
            if (index === undefined) {
                throw Error("Seriously???");
            }
            index *= Math.floor(this.population.length);
            nextGeneration.push(
                Model.merge(
                    sorted[i].model,
                    sorted[index].model,
                    this.perturbationFrequency,
                    this.perturbationMagnitude,
                ),
            );

            i = i % this.numModelsKept;
        }

        this.population = nextGeneration;
    }

    private updateTopK(models: ModelFitness[]): void {
        this.topKModels.concat(models.slice(0, this.numModelsKept));
        this.topKModels.sort((a, b) => b.fitness - a.fitness);
        this.topKModels = this.topKModels.slice(0, this.numModelsKept);
    }

    private async runPopulation(
        callback: (games: SnakeGame[]) => void,
    ): Promise<number[]> {
        const cores = navigator.hardwareConcurrency;

        const batchSize = Math.ceil(this.population.length / cores);
        let promises: Promise<number[]>[] = [];

        // Start by creating new worker threads to run training
        for (let i = 0; i < cores - 1; i++) {
            const batch = this.population.slice(
                batchSize * i,
                batchSize * (i + 1),
            );

            const promise = new Promise<number[]>((resolve) => {
                const worker = new Worker("worker.ts");

                worker.postMessage({
                    batch,
                    width: this.gameWidth,
                    height: this.gameHeight,
                });
                worker.onmessage = (e) => {
                    resolve(e.data.fitnesses);
                    worker.terminate();
                };
            });

            promises.push(promise);
        }

        // As sending data between workers is slow, we keep the main thread for a visualisation
        const batch = this.population.slice(
            (cores - 1) * batchSize,
            cores * batchSize,
        );

        let games = Array.from(
            { length: batch.length },
            () => new SnakeGame(this.gameWidth, this.gameHeight),
        );

        while (!games.every((game) => game.snakeDied())) {
            Trainer.runModelsOneStep(
                batch,
                games,
                this.gameWidth,
                this.gameHeight,
            );
            callback(games);
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

        while (!game.snakeDied()) {
            const encoding = Trainer.encodeGame(game, width, height);
            const decision = Trainer.getDecisionFromModel(model, encoding);
            game.setDirection(decision);
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
        encoding: number[],
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
    ): number[] {
        // Requirements for the input:
        // The full game board, encoding the number of moves before the square will be empty
        // i.e. 0 is empty now, 1 will be empty in 1 turn ...
        // x y of the apple
        // x y of the current snake direction
        // x y of snake head
        const offset = height * width;
        let encoding: number[] = Array(offset + 6).fill(0);

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
}

// This is a pretty simple model
// Simple dense layers with relu activation functions attached
// Using He initialisation for biases & weights
export class Model {
    private layerWeights: number[][][] = [];
    private layerBiases: number[][] = [];
    public name: string;

    private constructor(
        weights: number[][][],
        biases: number[][],
        name: string | undefined = undefined,
    ) {
        this.layerWeights = weights;
        this.layerBiases = biases;
        if (name === undefined) {
            this.name = Names.getName();
        } else {
            this.name = name;
        }
    }

    public static fromLayerSizes(
        inputSize: number,
        neuronsPerLayer: number[],
    ): Model {
        let layerWeights: number[][][] = [];
        let layerBiases: number[][] = [];

        let lastLayer = inputSize;

        for (const layerSize of neuronsPerLayer) {
            let weights: number[][] = [];
            let biases: number[] = [];

            for (let i = 0; i < layerSize; i++) {
                let neuron: number[] = [];

                for (let j = 0; j < lastLayer; j++) {
                    neuron.push(gaussian(Math.sqrt(2 / lastLayer)));
                }

                weights.push(neuron);
                biases.push(gaussian(Math.sqrt(0.2 / lastLayer)));
            }

            lastLayer = layerSize;
            layerWeights.push(weights);
            layerBiases.push(biases);
        }

        return new Model(layerWeights, layerBiases);
    }

    // Execute the model on some input data
    public execute(input: number[]): number[] {
        let previousOutputs = input;
        for (let i = 0; i < this.layerWeights.length; i++) {
            let neurons = this.layerWeights[i];
            let biases = this.layerBiases[i];

            let layerOut: number[] = [];

            for (const weights of neurons) {
                const out = relu(dot(weights, previousOutputs) + biases[i]);
                layerOut.push(out);
            }

            previousOutputs = layerOut;
        }
        return previousOutputs;
    }

    // Select random weights from both model A & B
    // Additionally add random perturbations to weights
    public static merge(
        modelA: Model,
        modelB: Model,
        perturbationFrequency: number,
        perturbationMagnitude: number,
    ): Model {
        let layerWeights: number[][][] = [];
        let layerBiases: number[][] = [];

        for (let layer = 0; layer < modelA.layerWeights.length; layer++) {
            const [weights, biases] = this.mergeLayer(
                layer,
                modelA,
                modelB,
                perturbationFrequency,
                perturbationMagnitude,
            );
            layerWeights.push(weights);
            layerBiases.push(biases);
        }

        return new Model(
            layerWeights,
            layerBiases,
            modelA.name.concat("-", modelB.name),
        );
    }

    private static mergeLayer(
        layer: number,
        modelA: Model,
        modelB: Model,
        perturbationFrequency: number,
        perturbationMagnitude: number,
    ): [number[][], number[]] {
        let newWeights: number[][] = [];
        let newBiases: number[] = [];
        // iterate over the neurons in the current layer
        for (
            let neuron = 0;
            neuron < modelA.layerWeights[layer].length;
            neuron++
        ) {
            let currentNeuron: number[] = [];
            // random perturbations to the bias
            const biasPerturb = this.getPerturbation(
                perturbationFrequency,
                perturbationMagnitude,
            );

            if (Math.random() > 0.5) {
                newBiases.push(modelA.layerBiases[layer][neuron] + biasPerturb);
            } else {
                newBiases.push(modelB.layerBiases[layer][neuron] + biasPerturb);
            }

            // for each neuron, merge the weights of the two models
            for (
                let weight = 0;
                weight < modelA.layerWeights[layer][neuron].length;
                weight++
            ) {
                // introduce random perturbations to weights
                const weightPerturb = this.getPerturbation(
                    perturbationFrequency,
                    perturbationMagnitude,
                );
                // randomly decided which weight to use
                if (Math.random() > 0.5) {
                    currentNeuron.push(
                        modelA.layerWeights[layer][neuron][weight] +
                            weightPerturb,
                    );
                } else {
                    currentNeuron.push(
                        modelB.layerWeights[layer][neuron][weight] +
                            weightPerturb,
                    );
                }
            }
        }
        return [newWeights, newBiases];
    }

    private static getPerturbation(
        frequency: number,
        magnitude: number,
    ): number {
        if (Math.random() < frequency) {
            return Math.random() * magnitude;
        }
        return 0;
    }
}

function relu(input: number): number {
    return input > 0 ? input : 0;
}

function dot(a: number[], b: number[]): number {
    return a.reduce((total, x, i) => total + x * b[i], 0);
}

function gaussian(sigma: number): number {
    let value =
        sigma *
        Math.sqrt(-2 * Math.log(Math.random())) *
        Math.cos(2 * Math.PI * Math.random());
    if (!Number.isSafeInteger(value)) {
        value = 0;
        console.log("Gaussian value was unsafe");
    }
    return value;
}

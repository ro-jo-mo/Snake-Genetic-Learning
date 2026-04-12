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
}

// This is a pretty simple model
// Simple dense layers with relu activation functions attached
// Using He initialisation for biases & weights
export class Model {
    private weights: Float32Array;
    private layout: number[];
    public name: string;

    private constructor(
        weights: Float32Array,
        layout: number[],
        name: string | undefined = undefined,
    ) {
        this.weights = weights;
        this.layout = layout;
        if (name === undefined) {
            this.name = Names.getName();
        } else {
            this.name = name;
        }
    }

    public static deserialize(data: {
        weights: Float32Array;
        layout: number[];
    }): Model {
        return new Model(data.weights, data.layout, "");
    }

    public static fromLayerSizes(
        inputSize: number,
        neuronsPerLayer: number[],
    ): Model {
        // add input / output layers
        const layers = [inputSize, ...neuronsPerLayer, 4];

        let totalSize = 0;

        for (let i = 1; i < layers.length; i++) {
            // weights per layer = neurons * neurons of last layer + neurons (bias term)
            totalSize += layers[i - 1] * layers[i] + layers[i];
        }

        let weights = new Float32Array(totalSize);

        let lastLayer = inputSize;

        let counter = 0;
        for (let layer = 1; layer < layers.length; layer++) {
            for (let neuron = 0; neuron < layers[layer]; neuron++) {
                for (let weight = 0; weight < lastLayer; weight++) {
                    weights[counter] = gaussian(Math.sqrt(2 / lastLayer));
                    counter++;
                }
                // bias
                weights[counter] = gaussian(Math.sqrt(0.25 / lastLayer));
                counter++;
            }
            lastLayer = layers[layer];
        }

        return new Model(weights, layers);
    }

    // Execute the model on some input data
    public execute(input: Float32Array): Float32Array {
        let lastOut = input;

        let counter = 0;
        for (let layer = 1; layer < this.layout.length; layer++) {
            // for neuron in this layer
            // iterate lastLayer + 1
            let nextOut = new Float32Array(this.layout[layer]);

            for (let neuron = 0; neuron < this.layout[layer]; neuron++) {
                for (let weight = 0; weight < lastOut.length; weight++) {
                    nextOut[neuron] += this.weights[counter] * lastOut[weight];
                    counter++;
                }
                // add bias & activation function
                nextOut[neuron] += this.weights[counter];
                counter++;
                // skip relu for output
                if (layer == this.layout.length - 1) {
                    continue;
                }
                nextOut[neuron] = relu(nextOut[neuron]);
            }

            lastOut = nextOut;
        }

        return lastOut;
    }

    // Select random weights from both model A & B
    // Additionally add random perturbations to weights
    public static merge(
        modelA: Model,
        modelB: Model,
        perturbationFrequency: number,
        perturbationMagnitude: number,
    ): Model {
        let weights = modelA.weights.slice();

        for (let i = 0; i < weights.length; i++) {
            weights[i] += this.getPerturbation(
                perturbationFrequency,
                perturbationMagnitude,
            );
        }

        return new Model(weights, modelA.layout, modelA.name);
    }

    private static getPerturbation(
        frequency: number,
        magnitude: number,
    ): number {
        if (Math.random() < frequency) {
            return (2 * Math.random() - 1) * magnitude;
        }
        return 0;
    }

    public backpropagation(
        input: Float32Array,
        expected: Float32Array,
    ): Float32Array {
        let forward = this.forwardPass(input);

        // variable names are hard :/
        // for the following code
        // L : loss
        // w : individual weight
        // z : weighted sum of a neuron, prior to activation (w1x1 + w2x2 + ... + bias)
        //
        // i.e dLdw = partial derivative of the loss function, with respect to an individual weight

        let gradients = new Float32Array(this.weights.length);
        let errorSignals = new Float32Array(forward.activations.length);

        let weightCounter = this.weights.length - 1;

        let layerOffset = 4;

        // start with softmax layers
        // 4 outputs
        for (let neuron = 0; neuron < 4; neuron++) {
            // number of weights per neuron in this layer (+1 for bias)
            // also represents the size of the previous layer (-1)
            const numOfWeights = this.layout.at(-2)! + 1;

            const errorSignal =
                forward.weightedSums.at(-neuron - 1)! -
                expected.at(-neuron - 1)!;

            errorSignals[errorSignals.length - neuron - 1] = errorSignal;

            // firstly do bias gradient
            gradients[weightCounter] = errorSignal;

            for (let weight = 1; weight < numOfWeights; weight++) {
                // error = activation of prior neuron connected with this weight
                // prior neuron = length - current layer size - prior layer size + current_weight_index
                const activation = forward.activations.at(
                    -layerOffset - weight - 1,
                )!;

                gradients[weightCounter] = errorSignal * activation;

                weightCounter--;
            }
        }

        for (let layer = this.layout.length - 2; layer > 0; layer--) {
            const numOfWeights = this.layout[layer - 1] + 1;

            const previousLayerSize = this.layout[layer + 1];
            const previousNumOfWeights = this.layout[layer] + 1;

            // an offset representing the index offset for the first weight of the downstream layer
            const weightsOffset = weightCounter + 1;

            for (let neuron = 0; neuron < this.layout[layer]; neuron++) {
                // error = sum of downstream error signals * the weight connecting them
                let errorSignal = 0;

                for (
                    let priorNeuron = 0;
                    priorNeuron < previousLayerSize;
                    priorNeuron++
                ) {
                    // I need to be able to get the error of all neurons in the downstream layer
                    // to do this I will use : errorSignals.at( - layeroffset + priorNeuron)
                    // I additionally need the weight attaching this neuron to the current one
                    // to get this I will use : weightsOffset + previousNumOfWeights * priorNeuron + neuron?

                    errorSignal +=
                        errorSignals.at(-layerOffset + priorNeuron)! *
                        this.weights[
                            weightsOffset +
                                previousNumOfWeights * priorNeuron +
                                neuron
                        ];
                }

                errorSignals[errorSignals.length - neuron - layerOffset] =
                    errorSignal;

                // firstly do bias gradient

                gradients[weightCounter] = errorSignal;
                weightCounter--;

                for (let weight = 1; weight < numOfWeights; weight++) {
                    // the activation of the neuron in the upstream layer connected to this neuron by weight w
                    const activation = forward.activations.at(
                        -layerOffset - weight - 1,
                    )!;

                    gradients[weightCounter] = errorSignal * activation;

                    weightCounter--;
                }
            }

            layerOffset += this.layout[layer];
        }

        return gradients;
    }

    private forwardPass(input: Float32Array): {
        weightedSums: Float32Array;
        activations: Float32Array;
    } {
        let lastOut = input;

        let neuronActivations = new Float32Array(
            this.layout.reduce((total, value) => total + value),
        );

        let neuronOutputs = new Float32Array(neuronActivations.length);

        let neuronCounter = 0;
        let counter = 0;
        for (let layer = 1; layer < this.layout.length; layer++) {
            // for neuron in this layer
            // iterate lastLayer + 1
            let nextOut = new Float32Array(this.layout[layer]);

            for (let neuron = 0; neuron < this.layout[layer]; neuron++) {
                for (let weight = 0; weight < lastOut.length; weight++) {
                    nextOut[neuron] += this.weights[counter] * lastOut[weight];
                    counter++;
                }

                // add bias & activation function
                nextOut[neuron] += this.weights[counter];
                counter++;
            }

            lastOut = nextOut;

            let activations;

            if (layer == this.layout.length - 1) {
                activations = softmax(lastOut);
            } else {
                activations = lastOut.map(relu);
            }

            for (let neuron = 0; neuron < lastOut.length; neuron++) {
                neuronActivations[neuronCounter] = activations[neuron];
                neuronOutputs[neuronCounter] = lastOut[neuron];
                neuronCounter++;
            }
        }

        return { weightedSums: neuronOutputs, activations: neuronActivations };
    }
}

function relu(input: number): number {
    return input > 0 ? input : 0;
}

function gaussian(sigma: number): number {
    let value =
        sigma *
        Math.sqrt(-2 * Math.log(Math.random())) *
        Math.cos(2 * Math.PI * Math.random());
    if (!Number.isFinite(value)) {
        console.log("Gaussian was funny?");
        return 0;
    }
    return value;
}

function crossEntropy(expected: Float32Array, predicted: Float32Array): number {
    // First apply softmax to the outputs
    const probabilities = softmax(predicted);

    return probabilities.reduce(
        (loss, current, index) => loss - Math.log(current) * expected[index],
    );
}

function softmax(values: Float32Array): Float32Array {
    const total = values.reduce((sum, current) => Math.exp(current) + sum);
    return values.map((value) => Math.exp(value) / total);
}

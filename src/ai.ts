import Names from "./names.js";

export class Trainer {
    constructor(
        population: number,
        keepTopK: number,
        perturbationMagnitude: number,
    ) {}
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
        ...neuronsPerLayer: number[]
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
    // Additionally
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

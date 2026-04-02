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
    layerWeights: number[][][] = [];
    layerBiases: number[][] = [];
    private constructor(weights: number[][][], biases: number[][]) {
        this.layerWeights = weights;
        this.layerBiases = biases;
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

    public static merge(modelA: Model, modelB: Model, noise: number): Model {
        let layerWeights: number[][][] = [];
        let layerBiases: number[][] = [];

        for (let layer = 0; layer < modelA.layerWeights.length; layer++) {
            let currentLayer: number[][] = [];
            for (
                let neuron = 0;
                neuron < modelA.layerWeights[layer].length;
                neuron++
            ) {
                let currentNeuron: number[] = [];
                for (
                    let weight = 0;
                    weight < modelA.layerWeights[layer][neuron].length;
                    weight++
                ) {}
            }
        }

        return new Model(layerWeights, layerBiases);
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

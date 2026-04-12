// This is a pretty simple model
// Simple dense layers with relu activation functions attached

import Names from "../names";

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

        // start with output layers
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
                activations = lastOut.map(sigmoid);
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

    public updateWeights(gradients: Float32Array, learningRate: number): void {
        for (let i = 0; i < this.weights.length; i++) {
            this.weights[i] -= learningRate * gradients[i];
        }
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

function sigmoid(value: number): number {
    return 1 / (1 + Math.exp(value));
}

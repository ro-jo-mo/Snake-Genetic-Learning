import { Trainer, Model } from "./ai";

self.onmessage = (e) => {
    const { batch, width, height } = e.data;

    const fitnesses = batch.map((model: Model) =>
        Trainer.runModel(model, width, height),
    );

    self.postMessage({ fitnesses });
};

import { Trainer, Model } from "./ai";

self.onmessage = (e) => {
    const { batch, width, height } = e.data;

    const fitnesses = batch.map((model: any) =>
        Trainer.runModel(Model.deserialize(model), width, height),
    );

    self.postMessage({ fitnesses });
};

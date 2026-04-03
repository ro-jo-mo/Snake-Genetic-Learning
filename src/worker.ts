import { Trainer, Model } from "./ai";

self.onmessage = (e) => {
    const { batch, width, height } = e.data;
    console.log(`worker activated ${batch.length}`);

    const fitnesses = batch.map((model: any) =>
        Trainer.runModel(Model.deserialize(model), width, height),
    );
    console.log(`Worker done ${batch.length}`);
    self.postMessage({ fitnesses });
};

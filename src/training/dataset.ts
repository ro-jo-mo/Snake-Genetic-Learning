import { SnakeGame, Vec2 } from "../snake";
import { Trainer } from "./ai";

class Dataset {
    private static directionMap = new Array(
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
    );

    // do random movements pretty much
    // until a collision
    // once a collision occurs, ensure the snake can reach apple or something
    // within the length of the snake
    public static generateExample(
        width: number,
        height: number,
    ): { game: Float32Array; labels: Float32Array } {
        let randint = (min = 0, max = 1) =>
            Math.floor(Math.random() * (max - min) + min);

        let snake: Vec2[] = [{ x: randint(0, width), y: randint(0, height) }];

        let lastDirection = { x: 0, y: 0 };

        while (true) {
            const head = snake.at(-1)!;

            // check nextpos is not backwards
            let randDirection;
            do {
                randDirection = Dataset.directionMap[randint(0, 4)];
            } while (
                randDirection.x === -lastDirection.x &&
                randDirection.y === -lastDirection.y
            );

            const nextPos = {
                x: head.x + randDirection.x,
                y: head.y + randDirection.y,
            };

            // check if the snake collided with wall or self
            if (
                snake.some(
                    (pos) => pos.x === nextPos.x && pos.y === nextPos.y,
                ) ||
                Dataset.boundsCheck(nextPos, width, height)
            ) {
                const validDir = Dataset.depthFirst(
                    width,
                    height,
                    snake,
                    nextPos,
                );
                // if this is a valid entry, return game encoding and labels
                if (validDir.some((x) => x === 1)) {
                    const game = SnakeGame.fromSnake(
                        snake,
                        randDirection,
                        width,
                        height,
                    );
                    return {
                        game: Trainer.encodeGame(game, width, height),
                        labels: validDir,
                    };
                }
                // else retry with a new snake
                else {
                    const temp = snake[0];
                    snake = [temp];
                    lastDirection = { x: 0, y: 0 };
                }
            } // if no collision add to snakew
            else {
                snake.push(nextPos);
            }
        }

        throw Error();
    }

    private static boundsCheck(
        pos: Vec2,
        width: number,
        height: number,
    ): boolean {
        // Check just the head is inside

        return pos.x >= width || pos.y >= height || pos.x < 0 || pos.y < 0;
    }

    private static depthFirst(
        width: number,
        height: number,
        snake: Vec2[],
        start: Vec2,
    ): Float32Array {
        const length = snake.length;

        let board = new Int32Array(width * height);

        const convert = (pos: Vec2) => pos.x + pos.y * width;

        for (const pos of snake) {
            board[convert(pos)] = -1;
        }

        board[convert(start)] = 1;

        let out = new Float32Array(4);

        for (let i = 0; i < 4; i++) {
            // very simple search to see if their is a path that takes
            // additionally i need to know which directions are valid

            const direction = Dataset.directionMap[i];

            const newPos = {
                x: start.x + direction.x,
                y: start.y + direction.y,
            };
            // as this only needs to run once I dont care too much about repeat work
            // much simpler to just check depth for each direction
            let copy = board.slice();
            copy[convert(newPos)] = 2;

            const valid = Dataset.searchBoard(
                newPos,
                width,
                height,
                length,
                copy,
            );
            // labels for dataset
            if (valid) {
                out[i] = 1;
            }
        }

        return out;
    }

    private static searchBoard(
        start: Vec2,
        width: number,
        height: number,
        length: number,
        board: Int32Array,
    ): boolean {
        const convert = (pos: Vec2) => pos.x + pos.y * width;

        for (const direction of Dataset.directionMap) {
            const currentValue = board[convert(start)];

            if (currentValue >= length) {
                return true;
            }

            const newPos = {
                x: start.x + direction.x,
                y: start.y + direction.y,
            };

            if (Dataset.boundsCheck(newPos, width, height)) {
                continue;
            }

            const value = board[convert(newPos)];

            // recurse on unseen squares and inefficiently pathed ones

            if (value === -1) {
                // snake blocking
                continue;
            } else if (value === 0 || value > currentValue + 1) {
                // unseen or inefficient
                board[convert(newPos)] = currentValue + 1;
                return this.searchBoard(newPos, width, height, length, board);
            }
        }

        return false;
    }
}

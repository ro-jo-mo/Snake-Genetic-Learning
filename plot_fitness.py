import re
import sys
import matplotlib.pyplot as plt


def parse_log(filepath):
    iteration = 0
    iterations = []
    fitnesses = []

    with open(filepath, "r") as f:
        for line in f:
            if "Running next training iteration" in line:
                iteration += 1
            match = re.search(r"Highest Fitness:\s*([\d.]+)", line)
            if match and iteration > 0:
                iterations.append(iteration)
                fitnesses.append(float(match.group(1)))

    return iterations, fitnesses


def main():
    filepath = """D:\Downloads\localhost-1775322080263.log"""
    iterations, fitnesses = parse_log(filepath)

    if not iterations:
        print("No fitness data found.")
        return

    plt.figure(figsize=(10, 6))
    plt.plot(iterations, fitnesses, marker="o", linewidth=1.5, markersize=4)
    plt.xlabel("Iteration")
    plt.ylabel("Highest Fitness")
    plt.title("Highest Fitness per Training Iteration")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig("fitness_plot.png", dpi=150)
    plt.show()
    print(f"Plotted {len(iterations)} iterations. Saved to fitness_plot.png")


if __name__ == "__main__":
    main()

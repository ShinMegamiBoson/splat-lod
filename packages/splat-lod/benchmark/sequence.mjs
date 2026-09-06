// Camera state, GPU resources and completion fences are deliberately serialized.
export const sequence = (values, action) => values.reduce((pending, value, index) => pending.then(() => action(value, index)), Promise.resolve());
export const indices = count => Array.from({ length: count }, (_, i) => i);
export async function until(done, action) {
    if (done()) return;
    await action();
    return until(done, action);
}

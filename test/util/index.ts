// Give this an async function that returns true or false and a time limit.
// If your fn doesn't return true by the time timeLimit ellapses, reject.
// If it returns true before timeLimit ellapses, resolve.
export const ensureEventually = async (timeLimit: number, fn: () => boolean): Promise<void> => {
  return new Promise<void>((resolve, reject) => {

    const start = Date.now()

    const interval = setInterval(() => {
      if (fn() === true) {
        clearInterval(interval)
        return resolve()
      }

      if (Date.now() - start >= timeLimit) {
        // We've surpassed our wait time
        clearInterval(interval)
        return reject()
      }

    }, 1000)
  })

}

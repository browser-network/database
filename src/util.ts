type LogLevel = 1 | 2 | 3 | 4 | 5

export const debugFactory = (appName: string) => {
  return (logLevel: LogLevel, ...args) => {
    if (window['DEBUG'] >= logLevel) {
      console.log(`[${logLevel}] ${appName}: `, ...args)
    }
  }
}

export const isPromise = (promise: any) => {
  return promise.hasOwnProperty('then')
}

export const exhaustive = (arg: never): never => {
  throw new Error('can not have gotten here')
}


import path from 'path';
import { OutputBundle } from 'rollup';

// https://github.com/relative-ci/bundle-stats/blob/master/packages/plugin-webpack-filter/src/index.ts
export type WebpackStatsFilteredAsset = {
  name: string;
  size?: number;
};

export interface WebpackStatsFilteredChunk {
  id: number | string;
  entry: boolean;
  initial: boolean;
  files?: Array<string>;
  names?: Array<string>;
}

export interface WebpackStatsFilteredModule {
  name: string;
  size?: number;
  chunks: Array<string | number>;
}

export interface WebpackStatsFilteredConcatenatedModule {
  name: string;
  size?: number;
}

export interface WebpackStatsFilteredRootModule
  extends WebpackStatsFilteredModule {
  modules?: Array<WebpackStatsFilteredConcatenatedModule>;
}

export interface WebpackStatsFiltered {
  builtAt?: number;
  hash?: string;
  assets?: Array<WebpackStatsFilteredAsset>;
  chunks?: Array<WebpackStatsFilteredChunk>;
  modules?: Array<WebpackStatsFilteredRootModule>;
}

const getByteSize = (content: string | Buffer): number => {
  if (typeof content === 'string') {
    return Buffer.from(content).length;
  }

  return content?.length || 0;
};

export type BundleTransformOptions = {
  /**
   * Extract module original size or rendered size
   * default: false
   */
  moduleOriginalSize?: boolean;
};

export const bundleToWebpackStats = (
  bundle: OutputBundle,
  customOptions?: BundleTransformOptions
): WebpackStatsFiltered => {
  const options = {
    moduleOriginalSize: false,
    ...customOptions,
  };

  const items = Object.values(bundle);

  const assets: Array<WebpackStatsFilteredAsset> = [];
  const chunks: Array<WebpackStatsFilteredChunk> = [];

  const moduleByFileName: Record<string, WebpackStatsFilteredModule> = {};

  items.forEach(item => {
    if (item.type === 'chunk') {
      assets.push({
        name: item.fileName,
        size: getByteSize(item.code),
      });

      const chunkId = item.name;

      chunks.push({
        id: chunkId,
        entry: item.isEntry,
        initial: !item.isDynamicEntry,
        files: [item.fileName],
        names: [item.name],
      });

      Object.entries(item.modules).forEach(([modulePath, moduleInfo]) => {
        // Remove unexpected rollup null prefix
        const normalizedModulePath = modulePath.replace('\u0000', '');

        const relativeModulePath = path.relative(
          process.cwd(),
          normalizedModulePath
        );

        // Match webpack output - add current directory prefix for child modules
        const relativeModulePathWithPrefix = relativeModulePath.match(/^\.\./)
          ? relativeModulePath
          : `.${path.sep}${relativeModulePath}`;

        const moduleEntry = moduleByFileName[relativeModulePathWithPrefix];

        if (moduleEntry) {
          moduleEntry.chunks.push(chunkId);
        } else {
          moduleByFileName[relativeModulePathWithPrefix] = {
            name: relativeModulePathWithPrefix,
            size: options.moduleOriginalSize
              ? moduleInfo.originalLength
              : moduleInfo.renderedLength,
            chunks: [chunkId],
          };
        }
      });
    } else if (item.type === 'asset') {
      assets.push({
        name: item.fileName,
        size: getByteSize(item.source.toString()),
      });
    } else {
      // noop for unknown types
    }
  });

  return {
    builtAt: Date.now(),
    assets,
    chunks,
    modules: Object.values(moduleByFileName),
  };
};

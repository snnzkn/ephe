/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { languages } from "monaco-editor";

type ILang = languages.ILanguageExtensionPoint & {
  loader: () => Promise<ILangImpl>;
};

type ILangImpl = {
  conf: languages.LanguageConfiguration;
  language: languages.IMonarchLanguage;
};

const languageDefinitions: { [languageId: string]: ILang } = {};

const languagePromises: { [languageId: string]: Promise<void> } = {};

export const loadLanguage = (languageId: string): Promise<void> => {
  if (!languagePromises[languageId]) {
    languagePromises[languageId] = loadLanguageInternal(languageId);
  }
  return languagePromises[languageId];
};

const loadLanguageInternal = (languageId: string): Promise<void> => {
  const loader = languageDefinitions[languageId].loader;
  return loader().then((mod) => {
    languages.setMonarchTokensProvider(languageId, mod.language);
    languages.setLanguageConfiguration(languageId, mod.conf);
  });
};

export const registerLanguage = (def: ILang): void => {
  const languageId = def.id;

  languageDefinitions[languageId] = def;
  languages.register(def);
  languages.onLanguage(languageId, () => {
    loadLanguage(languageId);
  });
};

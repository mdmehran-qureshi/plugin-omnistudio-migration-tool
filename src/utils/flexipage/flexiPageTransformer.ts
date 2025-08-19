/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { DuplicateKeyError, KeyNotFoundInStorageError, TargetPropertyNotFoundError } from '../../error/errorInterfaces';
import {
  Flexipage,
  FlexiComponentInstanceProperty,
  OmniScriptStorage,
  FlexcardStorage,
} from '../../migration/interfaces';
import { StorageUtil } from '../storageUtil';

/** Component name to look for during transformation */
const lookupComponentName = 'vlocityLWCOmniWrapper';
/** Target component name after transformation */
const targetComponentNameOS = 'runtime_omnistudio:omniscript';
/** Target identifier after transformation */
const targetIdentifierOS = 'runtime_omnistudio_omniscript';

let osSeq = 1;
let fcSeq = 1;

const targetComponentNameFlexCard = 'runtime_omnistudio:flexcard';
const targetIdentifierFlexCard = 'runtime_omnistudio_flexcard';

const flexCardPrefix = 'cf';

/**
 * Transforms a Flexipage bundle by replacing vlocityLWCOmniWrapper components
 * with runtime_omnistudio:omniscript components and updating their properties.
 *
 * This function performs the following transformations:
 * - Identifies vlocityLWCOmniWrapper components within the specified namespace
 * - Removes the 'target' property from component instance properties
 * - Creates new properties for language, subType, theme, and type
 * - Updates the component name and identifier to the target runtime component
 *
 * @param ogBundle - The original Flexipage bundle to transform
 * @param namespace - The namespace to filter components by
 * @returns The transformed Flexipage bundle if changes were made, or false if no changes were needed
 * @throws Error if the 'target' property is not found for a component
 */
export function transformFlexipageBundle(
  ogBundle: Flexipage,
  namespace: string,
  mode: 'assess' | 'migrate'
): Flexipage | boolean {
  osSeq = 1;
  fcSeq = 1;

  const bundle: Flexipage = JSON.parse(JSON.stringify(ogBundle)) as Flexipage;
  let changes = false;

  for (const region of bundle.flexiPageRegions) {
    if (!region.itemInstances) {
      continue;
    }
    for (const item of region.itemInstances) {
      if (
        item?.componentInstance?.componentName?.split(':')[0] !== namespace ||
        item?.componentInstance?.componentName?.split(':')[1] !== lookupComponentName
      ) {
        continue;
      }

      const typeSubtypeLanguage = item.componentInstance?.componentInstanceProperties?.find?.(
        (prop) => prop.name === 'target'
      )?.value;
      if (!typeSubtypeLanguage) {
        throw new TargetPropertyNotFoundError(item.componentInstance.componentName);
      }
      const newPropsWithComponentNameAndIdentifier = createNewProps(
        typeSubtypeLanguage.split(':')[1],
        namespace,
        mode,
        item.componentInstance.componentInstanceProperties
      );
      const newProps = newPropsWithComponentNameAndIdentifier.props;
      const targetComponentName = newPropsWithComponentNameAndIdentifier.componentName;
      const targetIdentifier = newPropsWithComponentNameAndIdentifier.identifier;
      changes = true;
      item.componentInstance.componentInstanceProperties = Object.entries(newProps).map(
        ([key, value]: [string, string]) => ({ name: key, value })
      );
      item.componentInstance.componentName = targetComponentName;
      item.componentInstance.identifier = targetIdentifier;
    }
  }

  return changes ? bundle : false;
}

/**
 * Creates new properties for the transformed component.
 * TODO: This function will be updated after Aastha's utility is available.
 *
 * @param _property - The original property value (currently unused)
 * @returns Object containing the new properties for the transformed component
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createNewProps(
  nameKey: string,
  namespace: string,
  mode: 'assess' | 'migrate',
  componentInstanceProperties: FlexiComponentInstanceProperty[]
): { componentName: string; identifier: string; props: Record<string, string> } {
  if (nameKey.startsWith(flexCardPrefix)) {
    return createNewPropsForFlexCard(nameKey.substring(flexCardPrefix.length).toLowerCase(), namespace, mode);
  }
  return createNewPropsForOmniScript(nameKey.toLowerCase(), namespace, mode, componentInstanceProperties);
}

function createNewPropsForOmniScript(
  nameKey: string,
  namespace: string,
  mode: 'assess' | 'migrate',
  componentInstanceProperties: FlexiComponentInstanceProperty[]
): { componentName: string; identifier: string; props: Record<string, string> } {
  let migratedScriptName: OmniScriptStorage;
  if (mode === 'assess') {
    migratedScriptName = StorageUtil.getOmnistudioAssessmentStorage().osStorage.get(nameKey);
  } else {
    migratedScriptName = StorageUtil.getOmnistudioMigrationStorage().osStorage.get(nameKey);
  }

  if (!migratedScriptName) {
    throw new KeyNotFoundInStorageError(nameKey, 'Omniscript');
  }

  if (migratedScriptName.isDuplicate) {
    throw new DuplicateKeyError(nameKey, 'Omniscript');
  }

  const newProps = {
    language: migratedScriptName.language || 'English',
    subType: migratedScriptName.subtype,
    type: migratedScriptName.type,
    theme: componentInstanceProperties.find((prop) => prop.name === 'layout')?.value || 'lightning',
    inlineVariant: 'brand',
    inlineLabel: '',
    display: 'Display OmniScript on page',
    direction: 'ltr',
  };

  return {
    componentName: targetComponentNameOS,
    identifier: `${targetIdentifierOS}${osSeq++}`,
    props: newProps,
  };
}

function createNewPropsForFlexCard(
  nameKey: string,
  namespace: string,
  mode: 'assess' | 'migrate'
): { componentName: string; identifier: string; props: Record<string, string> } {
  let migratedCardName: FlexcardStorage;
  if (mode === 'assess') {
    migratedCardName = StorageUtil.getOmnistudioAssessmentStorage().fcStorage.get(nameKey);
  } else {
    migratedCardName = StorageUtil.getOmnistudioMigrationStorage().fcStorage.get(nameKey);
  }

  if (!migratedCardName) {
    throw new KeyNotFoundInStorageError(nameKey, 'Flexcard');
  }

  if (migratedCardName.isDuplicate) {
    throw new DuplicateKeyError(nameKey, 'Flexcard');
  }

  const newProps = {
    flexcardName: migratedCardName.name,
  };

  return {
    componentName: targetComponentNameFlexCard,
    identifier: `${targetIdentifierFlexCard}${fcSeq++}`,
    props: newProps,
  };
}

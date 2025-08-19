/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import CardMappings from '../mappings/VlocityCard';
import { DebugTimer, QueryTools, SortDirection } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationTool,
  ObjectMapping,
  UploadRecordResult,
  MigrationStorage,
  FlexcardStorage,
} from './interfaces';
import { Connection, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { FlexCardAssessmentInfo } from '../../src/utils';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';

import { Constants } from '../utils/constants/stringContants';
import { StorageUtil } from '../utils/storageUtil';
import { getUpdatedAssessmentStatus } from '../utils/stringUtils';

export class CardMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly VLOCITYCARD_NAME = 'VlocityCard__c';
  static readonly OMNIUICARD_NAME = 'OmniUiCard';
  static readonly VERSION_PROP = 'Version__c';
  private readonly allVersions: boolean;

  constructor(
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages,
    ux: UX,
    allVersions: boolean
  ) {
    super(namespace, connection, logger, messages, ux);
    this.allVersions = allVersions;
  }

  getName(): string {
    return 'Flexcards';
  }

  getRecordName(record: string) {
    return this.allVersions
      ? `${record['Name']}_${record[this.namespacePrefix + CardMigrationTool.VERSION_PROP]}`
      : record['Name'];
  }

  getMappings(): ObjectMapping[] {
    return [
      {
        source: CardMigrationTool.VLOCITYCARD_NAME,
        target: CardMigrationTool.OMNIUICARD_NAME,
      },
    ];
  }

  // Perform Delete of OmniUiCard Records to start migration from scratch
  async truncate(): Promise<void> {
    const objectName = CardMigrationTool.OMNIUICARD_NAME;
    DebugTimer.getInstance().lap('Truncating ' + objectName);

    const ids: string[] = await QueryTools.queryIds(this.connection, objectName);
    if (ids.length === 0) return;

    const recordsToUpdate = ids.map((id) => {
      return {
        attributes: { type: CardMigrationTool.OMNIUICARD_NAME },
        Id: id,
        IsActive: false,
      };
    });

    // Mark the OmniUiCards as inactive
    await NetUtils.update(this.connection, recordsToUpdate);

    const success: boolean = await NetUtils.delete(this.connection, ids);
    if (!success) {
      throw new Error(this.messages.getMessage('couldNotTruncate', [objectName]));
    }
  }

  // Perform Records Migration from VlocityCard__c to OmniUiCard
  async migrate(): Promise<MigrationResult[]> {
    // Get All the Active VlocityCard__c records
    const allCards = await this.getAllActiveCards();
    Logger.log(this.messages.getMessage('foundFlexCardsToMigrate', [allCards.length]));

    // Filter out FlexCards with Angular OmniScript dependencies
    const cards: any[] = [];
    const skippedCards = new Map<string, any>();

    for (const card of allCards) {
      if (this.hasAngularOmniScriptDependencies(card)) {
        // Skip FlexCard with Angular dependencies
        Logger.logVerbose(
          `${this.messages.getMessage('skipFlexcardAngularOmniScriptDependencyWarning', [card['Name']])}`
        );
        skippedCards.set(card['Id'], {
          referenceId: card['Id'],
          id: '',
          success: false,
          hasErrors: false,
          errors: [],
          warnings: [this.messages.getMessage('flexCardWithAngularOmniScriptWarning')],
          newName: '',
          skipped: true,
        });
      } else {
        cards.push(card);
      }
    }

    Logger.log(`${this.messages.getMessage('flexCardMigrationProcessingMessage', [cards.length, skippedCards.size])}`);

    const progressBar = createProgressBar('Migrating', 'Flexcards');
    // Save the Vlocity Cards in OmniUiCard
    const cardUploadResponse = await this.uploadAllCards(cards, progressBar);

    // Add skipped cards to the response
    for (const [cardId, skippedResult] of skippedCards.entries()) {
      cardUploadResponse.set(cardId, skippedResult);
    }

    const records = new Map<string, any>();
    for (let i = 0; i < allCards.length; i++) {
      records.set(allCards[i]['Id'], allCards[i]);
    }

    return [
      {
        name: 'Flexcards',
        records: records,
        results: cardUploadResponse,
      },
    ];
  }

  public async assess(): Promise<FlexCardAssessmentInfo[]> {
    try {
      Logger.log(this.messages.getMessage('startingFlexCardAssessment'));
      const flexCards = await this.getAllActiveCards();
      Logger.log(this.messages.getMessage('foundFlexCardsToAssess', [flexCards.length]));

      const flexCardsAssessmentInfos = await this.processCardComponents(flexCards);
      this.prepareAssessmentStorageForFlexcards(flexCardsAssessmentInfos);
      return flexCardsAssessmentInfos;
    } catch (err) {
      if (err instanceof InvalidEntityTypeError) {
        throw err;
      }
      Logger.error(this.messages.getMessage('errorDuringFlexCardAssessment'), err);
    }
  }

  public async processCardComponents(flexCards: AnyJson[]): Promise<FlexCardAssessmentInfo[]> {
    const flexCardAssessmentInfos: FlexCardAssessmentInfo[] = [];
    let progressCounter = 0;
    const progressBar = createProgressBar('Assessing', 'Flexcards');
    progressBar.start(flexCards.length, progressCounter);
    const uniqueNames = new Set<string>();

    // Now process each OmniScript and its elements
    for (const flexCard of flexCards) {
      try {
        const flexCardAssessmentInfo = await this.processFlexCard(flexCard, uniqueNames);
        flexCardAssessmentInfos.push(flexCardAssessmentInfo);
      } catch (e) {
        flexCardAssessmentInfos.push({
          name: flexCard['Name'],
          oldName: flexCard['Name'],
          id: flexCard['Id'],
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesFC: [],
          dependenciesOS: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [this.messages.getMessage('unexpectedError')],
          migrationStatus: 'Failed',
        });
        const error = e as Error;
        Logger.error('Error processing flex card', error);
      }
      progressBar.update(++progressCounter);
    }
    progressBar.stop();
    return flexCardAssessmentInfos;
  }

  private async processFlexCard(flexCard: AnyJson, uniqueNames: Set<string>): Promise<FlexCardAssessmentInfo> {
    const flexCardName = flexCard['Name'];
    Logger.info(this.messages.getMessage('processingFlexCard', [flexCardName]));
    const version = flexCard[this.namespacePrefix + CardMigrationTool.VERSION_PROP];
    const flexCardAssessmentInfo: FlexCardAssessmentInfo = {
      name: this.allVersions ? `${flexCardName}_${version}` : flexCardName,
      oldName: this.allVersions ? `${flexCardName}_${version}` : flexCardName,
      id: flexCard['Id'],
      dependenciesIP: [],
      dependenciesDR: [],
      dependenciesOS: [],
      dependenciesFC: [],
      dependenciesLWC: [],
      dependenciesApexRemoteAction: [],
      infos: [],
      warnings: [],
      errors: [],
      migrationStatus: 'Ready for migration',
    };

    // Check for name changes due to API naming requirements
    const originalName: string = flexCardName;
    const cleanedName: string = this.cleanName(originalName);
    let assessmentStatus: 'Ready for migration' | 'Warnings' | 'Needs Manual Intervention' | 'Failed' =
      'Ready for migration';
    flexCardAssessmentInfo.name = this.allVersions ? `${cleanedName}_${version}` : cleanedName;
    if (cleanedName !== originalName) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('cardNameChangeMessage', [originalName, cleanedName])
      );
      assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Warnings');
    }

    // Check for duplicate names
    if (uniqueNames.has(cleanedName)) {
      flexCardAssessmentInfo.warnings.push(this.messages.getMessage('duplicateCardNameMessage', [cleanedName]));
      assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Needs Manual Intervention');
    }
    uniqueNames.add(cleanedName);

    // Check for author name changes
    const originalAuthor = flexCard[this.namespacePrefix + 'Author__c'];
    if (originalAuthor) {
      const cleanedAuthor = this.cleanName(originalAuthor);
      if (cleanedAuthor !== originalAuthor) {
        flexCardAssessmentInfo.warnings.push(
          this.messages.getMessage('authordNameChangeMessage', [originalAuthor, cleanedAuthor])
        );
        assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Warnings');
      }
    }

    flexCardAssessmentInfo.nameMapping = {
      oldName: flexCardName,
      newName: cleanedName,
    };

    flexCardAssessmentInfo.migrationStatus = assessmentStatus;
    this.updateDependencies(flexCard, flexCardAssessmentInfo);

    return flexCardAssessmentInfo;
  }

  private updateDependencies(flexCard, flexCardAssessmentInfo): void {
    let dataSource = JSON.parse(flexCard[this.namespacePrefix + 'Datasource__c'] || '{}');
    // Handle both camelCase and lowercase variants
    if (dataSource?.dataSource) {
      dataSource = dataSource.dataSource;
    } else if (dataSource?.datasource) {
      dataSource = dataSource.datasource;
    }

    // Check if it's a DataRaptor source
    if (dataSource.type === Constants.DataRaptorComponentName) {
      const originalBundle = dataSource.value?.bundle;
      if (originalBundle) {
        const cleanedBundle: string = this.cleanName(originalBundle);

        // Push original name instead of cleaned name for assessment consistency
        flexCardAssessmentInfo.dependenciesDR.push(originalBundle);

        // Add warning if DataRaptor name will change
        if (originalBundle !== cleanedBundle) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('dataRaptorNameChangeMessage', [originalBundle, cleanedBundle])
          );
          flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
            flexCardAssessmentInfo.migrationStatus,
            'Warnings'
          );
        }
      }
    } else if (dataSource.type === Constants.IntegrationProcedurePluralName) {
      const originalIpMethod = dataSource.value?.ipMethod;
      if (originalIpMethod) {
        const parts = originalIpMethod.split('_');
        const cleanedParts = parts.map((p) => this.cleanName(p, true));
        const cleanedIpMethod = cleanedParts.join('_');

        // Push original name instead of cleaned name for assessment consistency
        flexCardAssessmentInfo.dependenciesIP.push(originalIpMethod);

        // Add warning if IP name will change
        if (originalIpMethod !== cleanedIpMethod) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('integrationProcedureNameChangeMessage', [originalIpMethod, cleanedIpMethod])
          );
          flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
            flexCardAssessmentInfo.migrationStatus,
            'Warnings'
          );
        }

        // Add warning for IP references with more than 2 parts (which potentially need manual updates)
        if (parts.length > 2) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('integrationProcedureManualUpdateMessage', [originalIpMethod])
          );
          flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
            flexCardAssessmentInfo.migrationStatus,
            'Needs Manual Intervention'
          );
        }
      }
    } else if (dataSource.type === Constants.ApexRemoteComponentName) {
      const remoteClass = dataSource.value?.remoteClass;
      const remoteMethod = dataSource.value?.remoteMethod;
      Logger.info(`Remote Action name: ${remoteClass}.${remoteMethod}`);

      // Avoid duplicates
      if (!flexCardAssessmentInfo.dependenciesApexRemoteAction.includes(`${remoteClass}.${remoteMethod}`)) {
        flexCardAssessmentInfo.dependenciesApexRemoteAction.push(`${remoteClass}.${remoteMethod}`);
      }
    }

    // Check for Omniscript dependencies in the card's definition
    try {
      const definition = JSON.parse(flexCard[this.namespacePrefix + 'Definition__c'] || '{}');
      if (definition && definition.states) {
        for (const state of definition.states) {
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (const os of state.omniscripts) {
              if (os.type && os.subtype) {
                const originalOsRef = `${os.type}_${os.subtype}_${os.language || 'English'}`;
                const cleanedOsRef = `${this.cleanName(os.type)}_${this.cleanName(os.subtype)}_${
                  os.language || 'English'
                }`;

                // Push original name for consistency
                flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

                // Add warning if OmniScript name will change
                if (originalOsRef !== cleanedOsRef) {
                  flexCardAssessmentInfo.warnings.push(
                    this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
                  );
                  flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
                    flexCardAssessmentInfo.migrationStatus,
                    'Warnings'
                  );
                }
              }
            }
          }

          // Also check for omniscripts referenced in component actions
          if (state.components) {
            for (const componentKey in state.components) {
              if (state.components.hasOwnProperty(componentKey)) {
                const component = state.components[componentKey];
                this.checkComponentForDependencies(component, flexCardAssessmentInfo);
              }
            }
          }
        }
      }

      let childCards = this.readChildCardsFromDefinition(flexCard);
      // Add warnings for child card name changes
      for (const childCardName of childCards) {
        const cleanedChildCardName = this.cleanName(childCardName);

        // Push original child card name for consistency
        flexCardAssessmentInfo.dependenciesFC.push(childCardName);

        // Add warning if child card name will change
        if (childCardName !== cleanedChildCardName) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('cardNameChangeMessage', [childCardName, cleanedChildCardName])
          );
          flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
            flexCardAssessmentInfo.migrationStatus,
            'Warnings'
          );
        }
      }
    } catch (err) {
      // Log the error but continue processing
      Logger.error(`Error parsing definition for card ${flexCard.Name}: ${err.message}`);
    }
  }

  private readChildCardsFromDefinition(card: AnyJson): string[] {
    let childs = [];

    const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);
    if (!definition) return childs;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        childs = childs.concat(state.childCards);
      }
    }
    return childs;
  }

  private checkComponentForDependencies(component: any, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    // Check if this component is an action element
    if (component.element === 'action' && component.property && component.property.actionList) {
      // Process each action in the actionList
      for (const action of component.property.actionList) {
        if (action.stateAction) {
          // Case 1: Direct OmniScript reference
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            const omniType = action.stateAction.omniType;
            if (omniType.Name && typeof omniType.Name === 'string') {
              const originalName = omniType.Name;
              const parts = originalName.split('/');

              if (parts.length >= 2) {
                // Create both original and cleaned references for comparison
                const originalOsRef = parts.join('_');
                const cleanedParts =
                  parts.length >= 3
                    ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                    : parts.map((p) => this.cleanName(p));
                const cleanedOsRef = cleanedParts.join('_');

                // Push original name for consistency
                flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

                // Add warning only if the overall name will change
                if (originalOsRef !== cleanedOsRef) {
                  flexCardAssessmentInfo.warnings.push(
                    this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
                  );
                  flexCardAssessmentInfo.migrationStatus = 'Warnings';
                }
              }
            }
          }

          // MISSING PATTERN FIXED: Case 1b: Direct OmniScript reference without type check (for test compatibility)
          else if (action.stateAction.omniType && !action.stateAction.type) {
            const omniType = action.stateAction.omniType;
            // Handle both string omniType and object with Name property
            let omniTypeName: string;

            if (typeof omniType === 'string') {
              omniTypeName = omniType;
            } else if (omniType.Name && typeof omniType.Name === 'string') {
              omniTypeName = omniType.Name;
            } else {
              continue; // Skip if we can't extract the name
            }

            const parts = omniTypeName.split('/');
            if (parts.length >= 2) {
              const originalOsRef = parts.join('_');
              const cleanedParts =
                parts.length >= 3
                  ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                  : parts.map((p) => this.cleanName(p));
              const cleanedOsRef = cleanedParts.join('_');

              flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

              if (originalOsRef !== cleanedOsRef) {
                flexCardAssessmentInfo.warnings.push(
                  this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
                );
                flexCardAssessmentInfo.migrationStatus = 'Warnings';
              }
            }
          }

          // Case 2: Flyout OmniScript reference
          else if (
            action.stateAction.type === 'Flyout' &&
            action.stateAction.flyoutType === Constants.OmniScriptPluralName &&
            action.stateAction.osName
          ) {
            const osName = action.stateAction.osName;
            if (typeof osName === 'string') {
              // osName is typically in format "Omniscript/Testing/English"
              const originalName = osName;
              const parts = originalName.split('/');

              if (parts.length >= 2) {
                // Create both original and cleaned references for comparison
                const originalOsRef = parts.join('_');
                const cleanedParts =
                  parts.length >= 3
                    ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                    : parts.map((p) => this.cleanName(p));
                const cleanedOsRef = cleanedParts.join('_');

                // Push original name for consistency
                flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

                // Add warning only if the overall name will change
                if (originalOsRef !== cleanedOsRef) {
                  flexCardAssessmentInfo.warnings.push(
                    this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
                  );
                  flexCardAssessmentInfo.migrationStatus = 'Warnings';
                }
              }
            }
          }
        }
      }
    }

    // Check for Custom LWC component
    if (component.element === 'customLwc' && component.property) {
      // Check customlwcname property first
      if (component.property.customlwcname) {
        const customLwcName = component.property.customlwcname;
        Logger.info(`Custom LWC name: ${customLwcName}`);

        // Avoid duplicates
        if (!flexCardAssessmentInfo.dependenciesLWC.includes(customLwcName)) {
          flexCardAssessmentInfo.dependenciesLWC.push(customLwcName);
        }
      }
    }

    // Check standard component actions if they exist
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          const omniType = action.stateAction.omniType;
          if (omniType.Name && typeof omniType.Name === 'string') {
            const originalName = omniType.Name;
            const parts = originalName.split('/');
            if (parts.length >= 2) {
              // Create both original and cleaned references for comparison
              const originalOsRef = parts.join('_');
              const cleanedParts =
                parts.length >= 3
                  ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                  : parts.map((p) => this.cleanName(p));
              const cleanedOsRef = cleanedParts.join('_');

              // Push original name for consistency
              flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

              // Add warning if OmniScript name will change
              if (originalOsRef !== cleanedOsRef) {
                flexCardAssessmentInfo.warnings.push(
                  this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
                );
                flexCardAssessmentInfo.migrationStatus = 'Warnings';
              }
            }
          }
        }
      }
    }

    // MISSING PATTERN FIXED: Handle direct stateAction on component property
    if (component.property && component.property.stateAction) {
      // Case 1: Direct OmniScript reference on component property
      if (component.property.stateAction.omniType) {
        const omniType = component.property.stateAction.omniType;
        if (omniType.Name && typeof omniType.Name === 'string') {
          const originalName = omniType.Name;
          const parts = originalName.split('/');

          if (parts.length >= 2) {
            const originalOsRef = parts.join('_');
            const cleanedParts =
              parts.length >= 3
                ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                : parts.map((p) => this.cleanName(p));
            const cleanedOsRef = cleanedParts.join('_');

            flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

            if (originalOsRef !== cleanedOsRef) {
              flexCardAssessmentInfo.warnings.push(
                this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
              );
              flexCardAssessmentInfo.migrationStatus = 'Warnings';
            }
          }
        }
      }

      // Case 2: Flyout OmniScript reference on component property
      if (
        component.property.stateAction.type === 'Flyout' &&
        component.property.stateAction.flyoutType === 'OmniScripts' &&
        component.property.stateAction.osName
      ) {
        const osName = component.property.stateAction.osName;
        if (typeof osName === 'string') {
          const parts = osName.split('/');

          if (parts.length >= 2) {
            const originalOsRef = parts.join('_');
            const cleanedParts =
              parts.length >= 3
                ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                : parts.map((p) => this.cleanName(p));
            const cleanedOsRef = cleanedParts.join('_');

            flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

            if (originalOsRef !== cleanedOsRef) {
              flexCardAssessmentInfo.warnings.push(
                this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
              );
              flexCardAssessmentInfo.migrationStatus = 'Warnings';
            }
          }
        }
      }
    }

    // MISSING PATTERN FIXED: Handle omni-flyout elements (from tests)
    if (component.element === 'omni-flyout' && component.property && component.property.flyoutOmniScript) {
      if (component.property.flyoutOmniScript.osName) {
        const osName = component.property.flyoutOmniScript.osName;
        if (typeof osName === 'string') {
          const parts = osName.split('/');

          if (parts.length >= 2) {
            const originalOsRef = parts.join('_');
            const cleanedParts =
              parts.length >= 3
                ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
                : parts.map((p) => this.cleanName(p));
            const cleanedOsRef = cleanedParts.join('_');

            flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

            if (originalOsRef !== cleanedOsRef) {
              flexCardAssessmentInfo.warnings.push(
                this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
              );
              flexCardAssessmentInfo.migrationStatus = 'Warnings';
            }
          }
        }
      }
    }

    // Check child components recursively
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        this.checkComponentForDependencies(child, flexCardAssessmentInfo);
      }
    }
  }

  // Query all cards that are active
  private async getAllActiveCards(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query Vlocity Cards');
    const filters = new Map<string, any>();
    filters.set(this.namespacePrefix + 'CardType__c', 'flex');

    if (this.allVersions) {
      const sortFields = [
        { field: 'Name', direction: SortDirection.ASC },
        { field: this.namespacePrefix + 'Version__c', direction: SortDirection.ASC },
      ];
      return await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.namespace,
        CardMigrationTool.VLOCITYCARD_NAME,
        this.getCardFields(),
        filters,
        sortFields
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(
            `${CardMigrationTool.VLOCITYCARD_NAME} type is not found under this namespace`
          );
        }
        throw err;
      });
    } else {
      filters.set(this.namespacePrefix + 'Active__c', true);
      return await QueryTools.queryWithFilter(
        this.connection,
        this.namespace,
        CardMigrationTool.VLOCITYCARD_NAME,
        this.getCardFields(),
        filters
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(
            `${CardMigrationTool.VLOCITYCARD_NAME} type is not found under this namespace`
          );
        }
        throw err;
      });
    }
  }

  // Upload All the VlocityCard__c records to OmniUiCard
  private async uploadAllCards(
    cards: any[],
    progressBar: ReturnType<typeof createProgressBar>
  ): Promise<Map<string, UploadRecordResult>> {
    const cardsUploadInfo = new Map<string, UploadRecordResult>();
    const originalRecords = new Map<string, any>();
    const uniqueNames = new Set<string>();

    let progressCounter = 0;
    progressBar.start(cards.length, progressCounter);
    for (let card of cards) {
      await this.uploadCard(cards, card, cardsUploadInfo, originalRecords, uniqueNames);
      progressBar.update(++progressCounter);
    }

    this.prepareStorageForFlexcards(cardsUploadInfo, originalRecords);

    progressBar.stop();

    return cardsUploadInfo;
  }

  private async uploadCard(
    allCards: any[],
    card: AnyJson,
    cardsUploadInfo: Map<string, UploadRecordResult>,
    originalRecords: Map<string, any>,
    uniqueNames: Set<string>
  ) {
    const recordId = card['Id'];

    // If we already uploaded this card, skip
    if (cardsUploadInfo.has(recordId)) {
      return;
    }
    const isCardActive = card[`${this.namespacePrefix}Active__c`];

    try {
      const childCards = this.getChildCards(card);
      if (childCards.length > 0) {
        for (let childCardName of childCards) {
          // Upload child cards
          const childCard = allCards.find((c) => c['Name'] === childCardName);
          if (childCard) {
            await this.uploadCard(allCards, childCard, cardsUploadInfo, originalRecords, uniqueNames);
          }
        }

        this.updateChildCards(card);
      }

      // Perform the transformation
      const invalidIpNames = new Map<string, string>();
      const transformedCard = this.mapVlocityCardRecord(card, cardsUploadInfo, invalidIpNames);

      // Verify duplicated names
      let transformedCardName: string;
      if (this.allVersions) {
        transformedCardName = transformedCard['Name'] + '_' + transformedCard['VersionNumber'];
      } else {
        transformedCardName = transformedCard['Name'];
      }
      const transformedCardAuthorName = transformedCard['AuthorName'];

      if (uniqueNames.has(transformedCard['Name'])) {
        this.setRecordErrors(card, this.messages.getMessage('duplicatedCardName', [transformedCard['Name']]));
        originalRecords.set(recordId, card);
        return;
      }

      // Save the name for duplicated names check
      uniqueNames.add(transformedCard['Name']);

      // Create a map of the original records
      originalRecords.set(recordId, card);

      // Create card
      const uploadResult = await NetUtils.createOne(
        this.connection,
        CardMigrationTool.OMNIUICARD_NAME,
        recordId,
        transformedCard
      );

      if (uploadResult) {
        // Fix errors
        uploadResult.errors = uploadResult.errors || [];
        if (!uploadResult.success) {
          uploadResult.errors = Array.isArray(uploadResult.errors) ? uploadResult.errors : [uploadResult.errors];
        }

        // If name has been changed, add a warning message
        uploadResult.warnings = uploadResult.warnings || [];
        if (transformedCardAuthorName !== card[this.namespacePrefix + 'Author__c']) {
          uploadResult.warnings.unshift(
            this.messages.getMessage('cardAuthorNameChangeMessage', [transformedCardAuthorName])
          );
        }

        uploadResult.newName = transformedCardName;
        if (transformedCard['Name'] !== card['Name']) {
          uploadResult.warnings.unshift(this.messages.getMessage('cardNameChangeMessage', [transformedCardName]));
        }

        if (uploadResult.id && invalidIpNames.size > 0) {
          const val = Array.from(invalidIpNames.entries())
            .map((e) => e[0])
            .join(', ');
          uploadResult.errors.push(this.messages.getMessage('integrationProcedureManualUpdateMessage', [val]));
        }

        cardsUploadInfo.set(recordId, uploadResult);

        const updateResult = await NetUtils.updateOne(
          this.connection,
          CardMigrationTool.OMNIUICARD_NAME,
          recordId,
          uploadResult.id,
          {
            [CardMappings.Active__c]: isCardActive,
          }
        );

        if (!updateResult.success) {
          uploadResult.hasErrors = true;
          uploadResult.errors = uploadResult.errors || [];

          uploadResult.errors.push(this.messages.getMessage('errorWhileActivatingCard') + updateResult.errors);
        }
      }
    } catch (err) {
      this.setRecordErrors(card, this.messages.getMessage('errorWhileUploadingCard') + err);
      originalRecords.set(recordId, card);

      cardsUploadInfo.set(recordId, {
        referenceId: recordId,
        hasErrors: true,
        success: false,
        errors: err,
        warnings: [],
      });
    }
  }

  private prepareAssessmentStorageForFlexcards(flexcardAssessmentInfos: FlexCardAssessmentInfo[]) {
    let storage: MigrationStorage = StorageUtil.getOmnistudioAssessmentStorage();

    for (let flexCardAssessmentInfo of flexcardAssessmentInfos) {
      try {
        if (
          flexCardAssessmentInfo === undefined ||
          flexCardAssessmentInfo === null ||
          flexCardAssessmentInfo.nameMapping === undefined ||
          flexCardAssessmentInfo.nameMapping === null
        ) {
          Logger.error(this.messages.getMessage('missingInfo'));
          return;
        }

        let value: FlexcardStorage = {
          name: flexCardAssessmentInfo.nameMapping.newName,
          isDuplicate: false,
        };

        if (flexCardAssessmentInfo.errors && flexCardAssessmentInfo.errors.length > 0) {
          value.error = flexCardAssessmentInfo.errors;
          value.migrationSuccess = false;
        } else {
          value.migrationSuccess = true;
        }
        let finalKey = `${flexCardAssessmentInfo.nameMapping.oldName}`;
        finalKey = finalKey.toLowerCase();
        if (storage.fcStorage.has(finalKey)) {
          // Key already exists - handle accordingly
          Logger.logVerbose(this.messages.getMessage('keyAlreadyInStorage', [finalKey]));
          value.isDuplicate = true;
          storage.fcStorage.set(finalKey, value);
        } else {
          // Key doesn't exist - safe to set
          storage.fcStorage.set(finalKey, value);
        }
      } catch (error) {
        Logger.logVerbose(this.messages.getMessage('errorWhileProcessingFlexcardStorage'));
        Logger.error(error);
      }
    }
    StorageUtil.printAssessmentStorage();
  }

  private prepareStorageForFlexcards(
    cardsUploadInfo: Map<string, UploadRecordResult>,
    originalRecords: Map<string, any>
  ) {
    Logger.logVerbose(this.messages.getMessage('flexcardStorageProcessingStarted'));
    let storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();

    for (let key of Array.from(originalRecords.keys())) {
      try {
        let oldrecord = originalRecords.get(key);
        let newrecord = cardsUploadInfo.get(key);

        let value: FlexcardStorage = {
          name: newrecord?.newName,
          isDuplicate: false,
        };

        if (newrecord === undefined) {
          value.error = ['Migration Failed'];
        } else {
          if (newrecord.hasErrors) {
            value.error = newrecord.errors;
            value.migrationSuccess = false;
          } else {
            value.migrationSuccess = true;
          }
        }

        let finalKey = `${oldrecord['Name']}`;
        finalKey = finalKey.toLowerCase();
        if (storage.fcStorage.has(finalKey)) {
          // Key already exists - handle accordingly
          Logger.logVerbose(this.messages.getMessage('keyAlreadyInStorage', [finalKey]));
          value.isDuplicate = true;
          storage.fcStorage.set(finalKey, value);
        } else {
          // Key doesn't exist - safe to set
          storage.fcStorage.set(finalKey, value);
        }
      } catch (error) {
        Logger.logVerbose(this.messages.getMessage('errorWhileProcessingFlexcardStorage'));
        Logger.error(error);
      }

      StorageUtil.printMigrationStorage();
    }
  }

  private getChildCards(card: AnyJson): string[] {
    let childs = [];
    const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);
    if (!definition) return childs;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        childs = childs.concat(state.childCards);

        // Modify the name of the child cards
        state.childCards = state.childCards.map((c) => this.cleanName(c));
      }
    }

    return childs;
  }

  private updateChildCards(card: AnyJson): void {
    const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);
    if (!definition) return;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        state.childCards = state.childCards.map((c) => this.cleanName(c));
      }
    }

    card[this.namespacePrefix + 'Definition__c'] = JSON.stringify(definition);
  }

  // Maps an indivitdual VlocityCard__c record to an OmniUiCard record.
  private mapVlocityCardRecord(
    cardRecord: AnyJson,
    cardsUploadInfo: Map<string, UploadRecordResult>,
    invalidIpNames: Map<string, string>
  ): AnyJson {
    // Transformed object
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(cardRecord);

    // Map individual fields
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (CardMappings.hasOwnProperty(cleanFieldName) && cleanFieldName !== 'IsChildCard__c') {
        mappedObject[CardMappings[cleanFieldName]] = cardRecord[recordField];

        // Transform ParentId__c to ClonedFromOmniUiCardKey field from uploaded response map
        if (cleanFieldName === 'ParentID__c' && cardsUploadInfo.has(cardRecord[`${this.namespacePrefix}ParentID__c`])) {
          mappedObject[CardMappings[cleanFieldName]] = cardsUploadInfo.get(
            cardRecord[`${this.namespacePrefix}ParentID__c`]
          ).id;
        }

        // CardType__c and OmniUiCardType have different picklist values
        if (cleanFieldName === 'CardType__c') {
          let ischildCard = cardRecord[`${this.namespacePrefix}IsChildCard__c`];
          mappedObject['OmniUiCardType'] = ischildCard ? 'Child' : 'Parent';
        }

        // Child Cards don't have version, so assigning 1
        if (cleanFieldName === 'Version__c') {
          let versionNumber = cardRecord[`${this.namespacePrefix}Version__c`];
          mappedObject['VersionNumber'] = versionNumber ? versionNumber : 1;
        }
      }
    });

    // Clean the name
    mappedObject['Name'] = this.cleanName(mappedObject['Name']);
    mappedObject[CardMappings.Author__c] = this.cleanName(mappedObject[CardMappings.Author__c]);
    mappedObject[CardMappings.Active__c] = false;

    // Update the datasource
    const datasource = JSON.parse(mappedObject[CardMappings.Datasource__c] || '{}');
    if (datasource.dataSource) {
      const type = datasource.dataSource.type;
      if (type === Constants.DataRaptorComponentName) {
        datasource.dataSource.value.bundle = this.cleanName(datasource.dataSource.value.bundle);
      } else if (type === Constants.IntegrationProcedurePluralName) {
        const ipMethod: string = datasource.dataSource.value.ipMethod || '';

        const parts = ipMethod.split('_');
        const newKey = parts.map((p) => this.cleanName(p, true)).join('_');

        datasource.dataSource.value.ipMethod = newKey;

        if (parts.length > 2) {
          invalidIpNames.set('DataSource', ipMethod);
        }
      }
      mappedObject[CardMappings.Datasource__c] = JSON.stringify(datasource);
    }

    // Update all dependencies comprehensively
    this.updateAllDependenciesWithRegistry(mappedObject, invalidIpNames);

    mappedObject['attributes'] = {
      type: CardMigrationTool.OMNIUICARD_NAME,
      referenceId: cardRecord['Id'],
    };

    return mappedObject;
  }

  /**
   * Comprehensive dependency update using NameMappingRegistry - mirrors assessment logic
   */
  private updateAllDependenciesWithRegistry(mappedObject: any, invalidIpNames: Map<string, string>): void {
    // 1. Handle propertySet (Definition) datasource
    const propertySet = JSON.parse(mappedObject[CardMappings.Definition__c] || '{}');
    if (propertySet) {
      // Use NameMappingRegistry to update all dependency references first
      const updatedPropertySet = this.nameRegistry.updateDependencyReferences(propertySet);

      // Handle dataSource in propertySet
      if (updatedPropertySet.dataSource) {
        this.updateDataSourceWithRegistry(updatedPropertySet.dataSource, invalidIpNames, 'PropertySet');
      }

      // Handle states comprehensively
      if (updatedPropertySet.states && Array.isArray(updatedPropertySet.states)) {
        for (let i = 0; i < updatedPropertySet.states.length; i++) {
          const state = updatedPropertySet.states[i];

          // Handle child cards using registry
          if (state.childCards && Array.isArray(state.childCards)) {
            state.childCards = state.childCards.map((c) => {
              if (c && this.nameRegistry.hasFlexCardMapping(c)) {
                return this.nameRegistry.getFlexCardCleanedName(c);
              } else {
                Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['FlexCard', c])}`);
                return this.cleanName(c);
              }
            });
          }

          // Handle omniscripts using registry
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (let osIdx = 0; osIdx < state.omniscripts.length; osIdx++) {
              this.updateOmniScriptReferenceWithRegistry(state.omniscripts[osIdx]);
            }
          }

          // Handle components comprehensively using registry
          if (state.components) {
            for (const componentKey in state.components) {
              if (state.components.hasOwnProperty(componentKey)) {
                const component = state.components[componentKey];
                this.updateComponentDependenciesWithRegistry(component);
              }
            }
          }
        }
      }

      mappedObject[CardMappings.Definition__c] = JSON.stringify(updatedPropertySet);
    }
  }

  /**
   * Update dataSource (DataRaptor, Integration Procedures, Apex Remote) using registry
   */
  private updateDataSourceWithRegistry(dataSource: any, invalidIpNames: Map<string, string>, context: string): void {
    const type = dataSource.type;

    if (type === Constants.DataRaptorComponentName || type === 'DataRaptor') {
      // Handle DataRaptor using registry
      const originalBundle = dataSource.value?.bundle || '';
      if (originalBundle && this.nameRegistry.hasDataMapperMapping(originalBundle)) {
        dataSource.value.bundle = this.nameRegistry.getDataMapperCleanedName(originalBundle);
      } else {
        Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', originalBundle])}`);
        dataSource.value.bundle = this.cleanName(originalBundle);
      }
    } else if (type === Constants.IntegrationProcedurePluralName || type === 'IntegrationProcedures') {
      // Handle Integration Procedures using registry
      const ipMethod: string = dataSource.value?.ipMethod || '';
      const hasRegistryMapping = this.nameRegistry.hasIntegrationProcedureMapping(ipMethod);
      if (hasRegistryMapping) {
        const cleanedIpName = this.nameRegistry.getIntegrationProcedureCleanedName(ipMethod);
        dataSource.value.ipMethod = cleanedIpName;
      } else {
        Logger.logVerbose(
          `\n${this.messages.getMessage('componentMappingNotFound', ['IntegrationProcedure', ipMethod])}`
        );
        const parts = ipMethod.split('_');
        const newKey = parts.map((p) => this.cleanName(p, true)).join('_');
        dataSource.value.ipMethod = newKey;
        if (parts.length > 2) {
          invalidIpNames.set(context, ipMethod);
        }
      }
    }
  }

  /**
   * Update OmniScript reference using registry
   */
  private updateOmniScriptReferenceWithRegistry(omniscriptRef: any): void {
    const originalType = omniscriptRef.type;
    const originalSubtype = omniscriptRef.subtype;
    const language = omniscriptRef.language || 'English';

    // Construct full OmniScript name to check registry
    const fullOmniScriptName = `${originalType}_${originalSubtype}_${language}`;

    if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
      // Registry has mapping for this OmniScript - extract cleaned parts
      const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
      const parts = cleanedFullName.split('_');

      if (parts.length >= 2) {
        omniscriptRef.type = parts[0];
        omniscriptRef.subtype = parts[1];
        // Language doesn't typically change, but update if provided
        if (parts.length >= 3) {
          omniscriptRef.language = parts[2];
        }
      }
    } else {
      // No registry mapping - use original fallback approach
      Logger.logVerbose(
        `\n${this.messages.getMessage('componentMappingNotFound', ['Omniscript', fullOmniScriptName])}`
      );
      omniscriptRef.type = this.cleanName(originalType);
      omniscriptRef.subtype = this.cleanName(originalSubtype);
    }
  }

  /**
   * Update component dependencies comprehensively
   */
  private updateComponentDependenciesWithRegistry(component: any): void {
    // Handle action elements with actionList (like assessment)
    if (component.element === 'action' && component.property && component.property.actionList) {
      for (const action of component.property.actionList) {
        if (action.stateAction) {
          // Case 1: Direct OmniScript reference
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            this.updateOmniTypeNameWithRegistry(action.stateAction.omniType);
          }
          // Case 2: Flyout OmniScript reference
          else if (
            action.stateAction.type === 'Flyout' &&
            action.stateAction.flyoutType === Constants.OmniScriptPluralName &&
            action.stateAction.osName
          ) {
            this.updateOsNameWithRegistry(action.stateAction, 'osName');
          }
        }
      }
    }

    // Handle Custom LWC components (no cleaning needed typically)
    if (component.element === 'customLwc' && component.property) {
      // Note: Custom LWC names typically don't need cleaning
    }

    // Handle standard component actions (like assessment)
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          this.updateOmniTypeNameWithRegistry(action.stateAction.omniType);
        }
      }
    }

    // Handle direct stateAction on component property (existing logic)
    if (component.property && component.property.stateAction) {
      if (component.property.stateAction.omniType) {
        this.updateOmniTypeNameWithRegistry(component.property.stateAction.omniType);
      }
      if (
        component.property.stateAction.type === 'Flyout' &&
        component.property.stateAction.flyoutType === 'OmniScripts' &&
        component.property.stateAction.osName
      ) {
        this.updateOsNameWithRegistry(component.property.stateAction, 'osName');
      }
    }

    // Handle childCardPreview elements (from old fixChildren method)
    if (component.element === 'childCardPreview' && component.property) {
      if (component.property.cardName) {
        const originalCardName = component.property.cardName;
        if (this.nameRegistry.hasFlexCardMapping(originalCardName)) {
          component.property.cardName = this.nameRegistry.getFlexCardCleanedName(originalCardName);
        } else {
          Logger.logVerbose(
            `\n${this.messages.getMessage('componentMappingNotFound', ['FlexCard', originalCardName])}`
          );
          component.property.cardName = this.cleanName(originalCardName);
        }
      }
    }

    // Handle omni-flyout elements (missing from migration logic)
    if (component.element === 'omni-flyout' && component.property && component.property.flyoutOmniScript) {
      if (component.property.flyoutOmniScript.osName) {
        const osName = component.property.flyoutOmniScript.osName;
        if (typeof osName === 'string') {
          const parts = osName.split('/');

          if (parts.length >= 2) {
            // Construct full OmniScript name: Type_SubType_Language
            const originalOsRef = parts.join('_');

            if (this.nameRegistry.hasOmniScriptMapping(originalOsRef)) {
              // Registry has mapping - extract cleaned parts and convert back to / format
              const cleanedFullName = this.nameRegistry.getCleanedName(originalOsRef, 'OmniScript');
              const cleanedParts = cleanedFullName.split('_');

              if (cleanedParts.length >= 2) {
                component.property.flyoutOmniScript.osName = cleanedParts.join('/');
              }
            } else {
              // No registry mapping - use original fallback approach
              Logger.logVerbose(
                `\n${this.messages.getMessage('componentMappingNotFound', ['Omniscript', originalOsRef])}`
              );
              component.property.flyoutOmniScript.osName =
                parts.length >= 3
                  ? `${this.cleanName(parts[0])}/${this.cleanName(parts[1])}/${parts[2]}`
                  : parts.map((p) => this.cleanName(p)).join('/');
            }
          }
        }
      }
    }

    // Check child components recursively
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        this.updateComponentDependenciesWithRegistry(child);
      }
    }
  }

  /**
   * Update omniType.Name using registry (handles Type/SubType/Language format)
   */
  private updateOmniTypeNameWithRegistry(omniType: any): void {
    const originalName = omniType.Name || '';
    const parts = originalName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;

      if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
        // Registry has mapping - extract cleaned parts and convert back to / format
        const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
        const cleanedParts = cleanedFullName.split('_');

        if (cleanedParts.length >= 3) {
          omniType.Name = cleanedParts.join('/');
        }
      } else {
        // No registry mapping - use original fallback approach
        Logger.logVerbose(
          `\n${this.messages.getMessage('componentMappingNotFound', ['Omniscript', fullOmniScriptName])}`
        );
        omniType.Name =
          parts.length >= 3
            ? `${this.cleanName(parts[0])}/${this.cleanName(parts[1])}/${parts[2]}`
            : parts.map((p) => this.cleanName(p)).join('/');
      }
    } else {
      // Fallback for unexpected format
      omniType.Name = parts.map((p) => this.cleanName(p)).join('/');
    }
  }

  /**
   * Update osName using registry (handles Type/SubType/Language format)
   */
  private updateOsNameWithRegistry(stateAction: any, fieldName: string): void {
    const originalOsName = stateAction[fieldName];
    const parts = originalOsName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;

      if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
        // Registry has mapping - extract cleaned parts and convert back to / format
        const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
        const cleanedParts = cleanedFullName.split('_');

        if (cleanedParts.length >= 3) {
          stateAction[fieldName] = cleanedParts.join('/');
        }
      } else {
        // No registry mapping - use original fallback approach
        Logger.logVerbose(this.messages.getMessage('componentMappingNotFound', ['Omniscript', fullOmniScriptName]));
        stateAction[fieldName] =
          parts.length >= 3
            ? `${this.cleanName(parts[0])}/${this.cleanName(parts[1])}/${parts[2]}`
            : parts.map((p) => this.cleanName(p)).join('/');
      }
    } else {
      // Fallback for unexpected format
      stateAction[fieldName] = parts.map((p) => this.cleanName(p)).join('/');
    }
  }

  private getCardFields(): string[] {
    return Object.keys(CardMappings);
  }

  /**
   * Check if a FlexCard has dependencies on Angular OmniScripts
   */
  private hasAngularOmniScriptDependencies(card: AnyJson): boolean {
    try {
      const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c'] || '{}');
      if (definition && definition.states) {
        for (const state of definition.states) {
          // Check direct OmniScript references in states
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (const os of state.omniscripts) {
              if (os.type && os.subtype) {
                const osRef = `${os.type}_${os.subtype}_${os.language || 'English'}`;
                if (this.nameRegistry.isAngularOmniScript(osRef)) {
                  return true;
                }
              }
            }
          }

          // Check OmniScript references in component actions
          if (state.components) {
            for (const componentKey in state.components) {
              if (state.components.hasOwnProperty(componentKey)) {
                const component = state.components[componentKey];
                if (this.componentHasAngularOmniScriptDependency(component)) {
                  return true;
                }
              }
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`Error checking Angular dependencies for card ${card['Name']}: ${err.message}`);
    }

    return false;
  }

  /**
   * Recursively check if a component has Angular Omniscript dependencies
   */
  private componentHasAngularOmniScriptDependency(component: any): boolean {
    // Pattern 1: Handle action elements with actionList (like migration logic)
    if (component.element === 'action' && component.property && component.property.actionList) {
      for (const action of component.property.actionList) {
        if (action.stateAction) {
          // Case 1: Direct OmniScript reference with type check
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            if (this.checkOmniTypeForAngular(action.stateAction.omniType)) {
              return true;
            }
          }
          // Case 1b: Direct OmniScript reference without type check (for test compatibility)
          else if (action.stateAction.omniType && !action.stateAction.type) {
            if (this.checkOmniTypeForAngular(action.stateAction.omniType)) {
              return true;
            }
          }
          // Case 2: Flyout OmniScript reference
          else if (
            action.stateAction.type === 'Flyout' &&
            action.stateAction.flyoutType === Constants.OmniScriptPluralName &&
            action.stateAction.osName
          ) {
            if (this.checkOsNameForAngular(action.stateAction.osName)) {
              return true;
            }
          }
        }
      }
    }

    // Pattern 2: Handle standard component actions (like migration logic)
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          if (this.checkOmniTypeForAngular(action.stateAction.omniType)) {
            return true;
          }
        }
      }
    }

    // Pattern 3: Handle direct stateAction on component property (like migration logic)
    if (component.property && component.property.stateAction) {
      if (component.property.stateAction.omniType) {
        if (this.checkOmniTypeForAngular(component.property.stateAction.omniType)) {
          return true;
        }
      }
      if (
        component.property.stateAction.type === 'Flyout' &&
        component.property.stateAction.flyoutType === 'OmniScripts' &&
        component.property.stateAction.osName
      ) {
        if (this.checkOsNameForAngular(component.property.stateAction.osName)) {
          return true;
        }
      }
    }

    // Pattern 4: Handle omni-flyout elements (for test compatibility)
    if (component.element === 'omni-flyout' && component.property && component.property.flyoutOmniScript) {
      if (component.property.flyoutOmniScript.osName) {
        if (this.checkOsNameForAngular(component.property.flyoutOmniScript.osName)) {
          return true;
        }
      }
    }

    // Recursively check child components
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        if (this.componentHasAngularOmniScriptDependency(child)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if an omniType references an Angular OmniScript
   * Handles both string format and object with Name property
   */
  private checkOmniTypeForAngular(omniType: any): boolean {
    if (!omniType) {
      return false;
    }

    let omniTypeName: string;

    // Handle both string omniType and object with Name property
    if (typeof omniType === 'string') {
      omniTypeName = omniType;
    } else if (omniType.Name && typeof omniType.Name === 'string') {
      omniTypeName = omniType.Name;
    } else {
      return false;
    }

    const parts = omniTypeName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;
      return this.nameRegistry.isAngularOmniScript(fullOmniScriptName);
    }

    return false;
  }

  /**
   * Check if an osName string references an Angular OmniScript
   * Handles Type/SubType/Language format in string
   */
  private checkOsNameForAngular(osName: string): boolean {
    if (!osName || typeof osName !== 'string') {
      return false;
    }

    const parts = osName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;
      return this.nameRegistry.isAngularOmniScript(fullOmniScriptName);
    }

    return false;
  }
}

import { Connection, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { Logger } from '../utils/logger';
import { Constants } from '../utils/constants/stringContants';
import { OrgPreferences } from '../utils/orgPreferences';
import { askStringWithTimeout, PromptUtil } from '../utils/promptUtil';
import { YES_SHORT, YES_LONG, NO_SHORT, NO_LONG } from '../utils/projectPathUtil';
import { documentRegistry } from '../utils/constants/documentRegistry';
import { BaseMigrationTool } from './base';

const authEnvKey = 'OMA_AUTH_KEY';

export class PreMigrate extends BaseMigrationTool {
  // Source Custom Object Names
  public constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages, ux: UX) {
    super(namespace, connection, logger, messages, ux);
  }

  public async handleExperienceSitePrerequisites(
    objectsToProcess: string[],
    conn: Connection,
    isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean }
  ): Promise<void> {
    if (objectsToProcess.includes(Constants.ExpSites)) {
      const expMetadataApiConsent = await this.getExpSiteMetadataEnableConsent();
      Logger.logVerbose(this.messages.getMessage('experienceSiteMetadataConsent', [expMetadataApiConsent]));

      if (expMetadataApiConsent === false) {
        Logger.warn(this.messages.getMessage('experienceSiteConsentNotProvidedWarning'));
        this.removeKeyFromRelatedObjectsToProcess(Constants.ExpSites, objectsToProcess);
        Logger.logVerbose(
          this.messages.getMessage('relatedObjectsToProcessAfterExpSitesRemoval', [JSON.stringify(objectsToProcess)])
        );
        return;
      }

      const isMetadataAPIPreEnabled = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(conn);
      if (isMetadataAPIPreEnabled === true) {
        Logger.logVerbose(this.messages.getMessage('experienceBundleMetadataAPIAlreadyEnabled'));
        return;
      }

      Logger.logVerbose(this.messages.getMessage('enableExperienceBundleMetadataAPIProgramatically'));
      isExperienceBundleMetadataAPIProgramaticallyEnabled.value = await OrgPreferences.setExperienceBundleMetadataAPI(
        conn,
        true
      );
      if (isExperienceBundleMetadataAPIProgramaticallyEnabled.value === false) {
        this.removeKeyFromRelatedObjectsToProcess(Constants.ExpSites, objectsToProcess);
        Logger.warn(this.messages.getMessage('unableToEnableExperienceBundleMetadataAPI'));
      }

      Logger.logVerbose(this.messages.getMessage('relatedObjectsToProcess', [JSON.stringify(objectsToProcess)]));
    }
  }

  public async getAutoDeployConsent(
    includeLwc: boolean,
    actionItems: string[]
  ): Promise<{ autoDeploy: boolean; authKey: string | undefined }> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(this.messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(
          Logger.prompt.bind(Logger),
          this.messages.getMessage('autoDeployConsentMessage')
        );
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }

    const deploymentConfig = {
      autoDeploy: consent,
      authKey: undefined,
    };
    if (consent && includeLwc) {
      deploymentConfig.authKey = process.env[authEnvKey];
      if (!deploymentConfig.authKey) {
        Logger.warn(this.messages.getMessage('authKeyEnvVarNotSet'));
        actionItems.push(this.messages.getMessage('authKeyEnvVarNotSet'));
      }
    }

    if (!consent) {
      Logger.warn(this.messages.getMessage('deploymentConsentNotGiven'));
      actionItems.push(this.messages.getMessage('deploymentConsentNotGiven'));
    }

    if (!consent || (includeLwc && !deploymentConfig.authKey)) {
      actionItems.push(this.messages.getMessage('manualDeploymentSteps', [documentRegistry.manualDeploymentSteps]));
    }

    return deploymentConfig;
  }

  // This needs to be behind timeout
  private async getExpSiteMetadataEnableConsent(): Promise<boolean> {
    const question = this.messages.getMessage('consentForExperienceSites');
    const validResponse = false;

    while (!validResponse) {
      try {
        // Get string input from user with timeout
        const userInput = await askStringWithTimeout(
          Logger.prompt.bind(Logger),
          question,
          this.messages.getMessage('requestTimedOut')
        );

        // Validate and convert the input
        const normalizedInput = userInput.trim().toLowerCase();

        if (normalizedInput === YES_SHORT || normalizedInput === YES_LONG) {
          return true;
        } else if (normalizedInput === NO_SHORT || normalizedInput === NO_LONG) {
          return false;
        } else {
          // Invalid input - show error and continue loop to re-prompt
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (error) {
        // Handle timeout or other errors
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }
  }

  private removeKeyFromRelatedObjectsToProcess(keyToRemove: string, relatedObjects: string[]): void {
    const index = relatedObjects.indexOf(Constants.ExpSites);
    if (index > -1) {
      relatedObjects.splice(index, 1);
    }
  }
}

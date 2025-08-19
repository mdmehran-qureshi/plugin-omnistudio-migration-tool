import { Messages } from '@salesforce/core';
import { FlexCardAssessmentInfo, LWCAssessmentInfo } from '../interfaces';
import { CTASummary } from '../reportGenerator/reportInterfaces';
import {
  IPAssessmentInfo,
  OSAssessmentInfo,
  DataRaptorAssessmentInfo,
  ApexAssessmentInfo,
  GlobalAutoNumberAssessmentInfo,
} from '../interfaces';
import { documentRegistry } from '../constants/documentRegistry';
import { Logger } from '../logger';

Messages.importMessagesDirectory(__dirname);
const assessMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');

export class reportingHelper {
  public static getCallToAction(
    assessmentInfos: Array<
      | IPAssessmentInfo
      | OSAssessmentInfo
      | DataRaptorAssessmentInfo
      | ApexAssessmentInfo
      | LWCAssessmentInfo
      | GlobalAutoNumberAssessmentInfo
      | FlexCardAssessmentInfo
    >
  ): CTASummary[] {
    const callToAction = [];
    assessmentInfos.forEach((assessmentInfo) => {
      if (assessmentInfo.warnings && assessmentInfo.warnings.length > 0) {
        for (const info of assessmentInfo.warnings) {
          for (const key of Object.keys(documentRegistry)) {
            const value = assessMessages.getMessage(key);
            if (
              typeof value === 'string' &&
              typeof key === 'string' &&
              this.checkMatch(info, value) &&
              this.getLink(key) !== undefined
            ) {
              callToAction.push({
                name: key,
                message: info,
                link: this.getLink(key),
              });
            }
          }
        }
      }
    });
    return this.uniqueByName(callToAction);
  }

  // This function checks if one string is derived from another string by replacing %s with wildcard
  private static checkMatch(info: string, message: string): boolean {
    // Escape regex special chars except %s
    function escapeRegex(s: string): string {
      return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    try {
      // Convert template to regex pattern by replacing %s with wildcard
      const parts = message.split('%s').map(escapeRegex);
      const pattern = '^' + parts.join('(.+?)') + '$';
      const regex = new RegExp(pattern);
      if (regex.test(info)) {
        return true;
      }
    } catch (error) {
      Logger.error(error);
      return false;
    }
    return false;
  }

  private static uniqueByName(arr: CTASummary[]): CTASummary[] {
    const seen = new Set<string>();
    return arr.filter((item) => {
      if (seen.has(item.name)) {
        return false;
      } else {
        seen.add(item.name);
        return true;
      }
    });
  }

  private static getLink(key: string): string {
    if (documentRegistry[key]) {
      return documentRegistry[key] as string;
    }
    Logger.logVerbose(`No link found for ${key}`);
    return undefined;
  }
}

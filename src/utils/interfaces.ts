import { File } from '../utils/file/fileUtil';
import { CustomLabelAssessmentInfo, CustomLabelStatistics } from './customLabels';

export interface MigratedObject {
  name: string;
  data?: MigratedRecordInfo[];
  errors?: string[];
}

export interface MigratedRecordInfo {
  id: string;
  name: string;
  status:
    | 'Ready for migration'
    | 'Failed'
    | 'Skipped'
    | 'Successfully migrated'
    | 'Needs Manual Intervention'
    | 'Warnings';
  errors: string[];
  migratedId?: string;
  migratedName?: string;
  warnings: string[];
  localizationStatus?: Record<string, string>;
}

export interface DiffPair {
  old: string | null;
  new: string | null;
}

export interface LWCAssessmentInfo {
  name: string;
  changeInfos: FileChangeInfo[];
  errors: string[];
  warnings: string[];
}

export interface OSAssessmentInfo {
  name: string;
  id: string;
  oldName: string;
  dependenciesIP: nameLocation[];
  missingIP: string[];
  dependenciesDR: nameLocation[];
  missingDR: string[];
  migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Complete' | 'Needs Manual Intervention' | 'Warnings';
  dependenciesOS: nameLocation[];
  missingOS: string[];
  dependenciesRemoteAction: nameLocation[];
  dependenciesLWC: nameLocation[];
  type: string;
  infos: string[];
  warnings: string[];
  errors: string[];
  nameMapping?: OmniscriptNameMapping;
}

export interface FlexcardNameMapping {
  oldName: string;
  newName: string;
}

export interface OmniscriptNameMapping {
  oldType: string;
  oldSubtype: string;
  newType: string;
  newSubType: string;
  oldLanguage: string;
  newLanguage: string;
}

export interface IPAssessmentInfo {
  name: string;
  id: string;
  oldName: string;
  dependenciesIP: nameLocation[];
  dependenciesDR: nameLocation[];
  dependenciesOS: nameLocation[];
  dependenciesRemoteAction: nameLocation[];
  infos: string[];
  warnings: string[];
  errors: string[];
  path: string;
  migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Complete' | 'Needs Manual Intervention' | 'Warnings';
}
export interface FileChangeInfo {
  path: string;
  name: string;
  diff: string;
}
export interface ApexAssessmentInfo extends FileChangeInfo {
  warnings: string[];
  infos: string[];
}

export interface FileParser {
  parse(filePath: string, namespace: string): Map<string, string>;
  saveToFile(filePath: string, content: string | undefined): void;
}

export interface FileProcessor {
  process(file: File, type: string, namespace: string): void;
}

export interface AssessmentInfo {
  apexAssessmentInfos: ApexAssessmentInfo[];
  lwcAssessmentInfos: LWCAssessmentInfo[];
  omniAssessmentInfo: OmniAssessmentInfo; // Corrected to an array
  flexCardAssessmentInfos: FlexCardAssessmentInfo[];
  dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[];
  experienceSiteAssessmentInfos: ExperienceSiteAssessmentInfo[];
  flexipageAssessmentInfos: FlexiPageAssessmentInfo[];
  globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[];
  customLabelAssessmentInfos: CustomLabelAssessmentInfo[];
  customLabelStatistics: CustomLabelStatistics;
}

export interface RelatedObjectAssesmentInfo {
  apexAssessmentInfos: ApexAssessmentInfo[];
  lwcAssessmentInfos: LWCAssessmentInfo[];
  flexipageAssessmentInfos: FlexiPageAssessmentInfo[];
  experienceSiteAssessmentInfos: ExperienceSiteAssessmentInfo[];
}
export interface FlexCardAssessmentInfo {
  name: string;
  oldName: string;
  id: string;
  dependenciesIP: string[];
  dependenciesDR: string[];
  dependenciesOS: string[];
  dependenciesFC: string[];
  dependenciesLWC: string[];
  dependenciesApexRemoteAction: string[];
  infos: string[];
  warnings: string[];
  errors: string[];
  migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Complete' | 'Needs Manual Intervention' | 'Warnings';
  nameMapping?: FlexcardNameMapping;
}

export interface FlexcardNameMapping {
  oldName: string;
  newName: string;
}

export interface DataRaptorAssessmentInfo {
  oldName: string;
  name: string;
  id: string;
  formulaChanges: oldNew[];
  type: string;
  infos: string[];
  warnings: string[];
  errors: string[];
  apexDependencies: string[];
  migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Complete' | 'Needs Manual Intervention' | 'Warnings';
}

export interface GlobalAutoNumberAssessmentInfo {
  oldName: string;
  name: string;
  id: string;
  infos: string[];
  warnings: string[];
  errors: string[];
}

export interface OmniAssessmentInfo {
  osAssessmentInfos: OSAssessmentInfo[];
  ipAssessmentInfos: IPAssessmentInfo[];
}

export interface FileChangeInfo {
  path: string;
  name: string;
  diff: string;
}
export interface ApexAssessmentInfo extends FileChangeInfo {
  warnings: string[];
  infos: string[];
  errors: string[];
}

export interface FileParser {
  parse(filePath: string, namespace: string): Map<string, string>;
  // saveToFile(filePath: string, content: string | undefined): void;
}

export interface ExperienceSiteAssessmentInfo extends FileChangeInfo {
  warnings: string[];
  infos: string[];
  hasOmnistudioContent: boolean;
  errors: string[];
  status: 'Ready for migration' | 'Failed' | 'Successfully migrated' | 'Needs Manual Intervention' | 'Skipped';
}

export interface FileProcessor {
  process(file: File, type: string, namespace: string): string;
}

export interface nameLocation {
  name: string;
  location: string;
}

export interface oldNew {
  old: string;
  new: string;
}

export interface OmniStudioSettingsMetadata {
  fullName: string;
  disableRollbackFlagsPref: boolean;
}

export interface MetadataInfo {
  fullName: string;
  disableRollbackFlagsPref?: boolean;
  enableOmniGlobalAutoNumberPref?: string;
  enableOaEventInternalWrites?: string;
  enableOaEventNotifications?: string;
  enableOaForCore?: string;
  enableOmniStudioContentTest?: string;
  enableOmniStudioDrVersion?: string;
  enableOmniStudioMetadata?: string;
  enableStandardOmniStudioRuntime?: string;
}

export interface ExperienceBundleSettingsMetadata {
  fullName: string;
  enableExperienceBundleMetadata: boolean;
}

export interface ExperienceBundleSettingsReadMetadata {
  fullName: string;
  enableExperienceBundleMetadata: string;
}

export interface QueryResult {
  DeveloperName: string;
  Value: string;
  totalSize: number;
  done: boolean;
  records: Array<{
    attributes: {
      type: string;
      url: string;
    };
    DeveloperName: string;
    Value: string;
  }>;
}

export interface FlexiPageAssessmentInfo extends FileChangeInfo {
  errors: string[];
  status:
    | 'Ready for migration'
    | 'Failed'
    | 'Warnings'
    | 'Successfully migrated'
    | 'Needs Manual Intervention'
    | 'Skipped';
}

import { FlexCardAssessmentInfo } from '../interfaces';
import { Logger } from '../logger';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import { createFilterGroupParam, createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';
import { reportingHelper } from './reportingHelper';

export class FlexcardAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'flexcard-row-data-';
  public static getFlexcardAssessmentData(
    flexCardAssessmentInfos: FlexCardAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('fc data:', flexCardAssessmentInfos);
    return {
      title: 'Flexcards Assessment Report',
      heading: 'Flexcards Assessment Report',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      total: flexCardAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(flexCardAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(flexCardAssessmentInfos, instanceUrl),
      callToAction: reportingHelper.getCallToAction(flexCardAssessmentInfos),
    };
  }

  public static getSummaryData(flexCardAssessmentInfos: FlexCardAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: 'Ready for migration',
        count: flexCardAssessmentInfos.filter(
          (flexCardAssessmentInfo) => flexCardAssessmentInfo.migrationStatus === 'Ready for migration'
        ).length,
        cssClass: 'text-success',
      },
      {
        name: 'Warnings',
        count: flexCardAssessmentInfos.filter(
          (flexCardAssessmentInfo) => flexCardAssessmentInfo.migrationStatus === 'Warnings'
        ).length,
        cssClass: 'text-warning',
      },
      {
        name: 'Needs Manual Intervention',
        count: flexCardAssessmentInfos.filter(
          (flexCardAssessmentInfo) => flexCardAssessmentInfo.migrationStatus === 'Needs Manual Intervention'
        ).length,
        cssClass: 'text-error',
      },
      {
        name: 'Failed',
        count: flexCardAssessmentInfos.filter(
          (flexCardAssessmentInfo) => flexCardAssessmentInfo.migrationStatus === 'Failed'
        ).length,
        cssClass: 'text-error',
      },
    ];
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: 'Managed Package',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'Standard',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Assessment Status',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Summary',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Omniscript Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Integration Procedure Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Data Mapper Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Flexcard Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Remote Action Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Custom LWC Dependencies',
            colspan: 1,
            rowspan: 2,
          },
        ],
      },
      {
        header: [
          {
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'ID',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }
  private static getFilterGroupsForReport(flexCardAssessmentInfo: FlexCardAssessmentInfo[]): FilterGroupParam[] {
    const distinctStatuses = [...new Set(flexCardAssessmentInfo.map((info) => info.migrationStatus))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [createFilterGroupParam('Filter By Assessment Status', 'status', distinctStatuses)]
        : [];

    return [...statusFilterGroupParam];
  }

  private static getRowsForReport(
    flexCardAssessmentInfos: FlexCardAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    return flexCardAssessmentInfos.map((flexCardAssessmentInfo) => ({
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
      data: [
        createRowDataParam(
          'name',
          flexCardAssessmentInfo.oldName,
          true,
          1,
          1,
          false,
          undefined,
          undefined,
          flexCardAssessmentInfo.migrationStatus === 'Needs Manual Intervention' ||
            flexCardAssessmentInfo.migrationStatus === 'Failed'
            ? 'invalid-icon'
            : ''
        ),
        createRowDataParam(
          'recordId',
          flexCardAssessmentInfo.id,
          false,
          1,
          1,
          true,
          `${instanceUrl}/${flexCardAssessmentInfo.id}`
        ),
        createRowDataParam('newName', flexCardAssessmentInfo.name, false, 1, 1, false),
        createRowDataParam(
          'status',
          flexCardAssessmentInfo.migrationStatus,
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          flexCardAssessmentInfo.migrationStatus === 'Ready for migration'
            ? 'text-success'
            : flexCardAssessmentInfo.migrationStatus === 'Warnings'
            ? 'text-warning'
            : 'text-error'
        ),
        createRowDataParam(
          'summary',
          flexCardAssessmentInfo.warnings ? flexCardAssessmentInfo.warnings.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.warnings,
          flexCardAssessmentInfo.migrationStatus === 'Warnings'
            ? 'text-warning'
            : flexCardAssessmentInfo.migrationStatus === 'Ready for migration'
            ? ''
            : 'text-error'
        ),
        createRowDataParam(
          'omniScriptDependencies',
          flexCardAssessmentInfo.dependenciesOS ? flexCardAssessmentInfo.dependenciesOS.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesOS
        ),
        createRowDataParam(
          'integrationProcedureDependencies',
          flexCardAssessmentInfo.dependenciesIP ? flexCardAssessmentInfo.dependenciesIP.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesIP
        ),
        createRowDataParam(
          'dataMapperDependencies',
          flexCardAssessmentInfo.dependenciesDR ? flexCardAssessmentInfo.dependenciesDR.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesDR
        ),
        createRowDataParam(
          'flexcardDependencies',
          flexCardAssessmentInfo.dependenciesFC ? flexCardAssessmentInfo.dependenciesFC.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesFC
        ),
        createRowDataParam(
          'remoteActionDependencies',
          flexCardAssessmentInfo.dependenciesApexRemoteAction
            ? flexCardAssessmentInfo.dependenciesApexRemoteAction.join(', ')
            : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesApexRemoteAction
        ),
        createRowDataParam(
          'customLwcDependencies',
          flexCardAssessmentInfo.dependenciesLWC ? flexCardAssessmentInfo.dependenciesLWC.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesLWC
        ),
      ],
    }));
  }
}

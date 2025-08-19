import { LWCAssessmentInfo } from '../interfaces';
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
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { reportingHelper } from './reportingHelper';

export class LWCAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'lwc-row-data-';
  public static getLwcAssessmentData(
    lwcAssessmentInfos: LWCAssessmentInfo[],
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('lwc data:', lwcAssessmentInfos);
    return {
      title: 'Lightning Web Components Assessment Report',
      heading: 'Lightning Web Components Assessment Report',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      total: lwcAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(lwcAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(lwcAssessmentInfos),
      callToAction: reportingHelper.getCallToAction(lwcAssessmentInfos),
    };
  }

  public static getSummaryData(lwcAssessmentInfos: LWCAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: 'Ready for migration',
        count: lwcAssessmentInfos.filter(
          (lwcAssessmentInfo) => this.getMigrationStatus(lwcAssessmentInfo) === 'Ready for migration'
        ).length,
        cssClass: 'text-success',
      },
      {
        name: 'Warnings',
        count: lwcAssessmentInfos.filter((info) => this.getMigrationStatus(info) === 'Warnings').length,
        cssClass: 'text-warning',
      },
      {
        name: 'Needs Manual Intervention',
        count: lwcAssessmentInfos.filter((info) => this.getMigrationStatus(info) === 'Needs Manual Intervention')
          .length,
        cssClass: 'text-error',
      },
      {
        name: 'Failed',
        count: lwcAssessmentInfos.filter((info) => this.getMigrationStatus(info) === 'Failed').length,
        cssClass: 'text-error',
      },
    ];
  }

  private static getRowsForReport(lwcAssessmentInfos: LWCAssessmentInfo[]): ReportRowParam[] {
    const rows: ReportRowParam[] = [];

    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      const changeInfosCount = lwcAssessmentInfo.changeInfos.length;
      const rId = `${this.rowIdPrefix}${this.rowId++}`;

      for (let fileIndex = 0; fileIndex < lwcAssessmentInfo.changeInfos.length; fileIndex++) {
        const fileChangeInfo = lwcAssessmentInfo.changeInfos[fileIndex];

        rows.push({
          rowId: rId,
          data: [
            ...(fileIndex === 0
              ? [
                  createRowDataParam(
                    'name',
                    lwcAssessmentInfo.name,
                    true,
                    changeInfosCount,
                    1,
                    false,
                    undefined,
                    undefined,
                    this.getMigrationStatus(lwcAssessmentInfo) === 'Needs Manual Intervention' ||
                      this.getMigrationStatus(lwcAssessmentInfo) === 'Failed'
                      ? 'invalid-icon'
                      : ''
                  ),
                ]
              : []),
            createRowDataParam(
              'fileReference',
              fileChangeInfo.name,
              false,
              1,
              1,
              true,
              fileChangeInfo.path,
              fileChangeInfo.name,
              'normal-td-padding'
            ),
            createRowDataParam(
              'diff',
              fileChangeInfo.name + 'diff',
              false,
              1,
              1,
              false,
              undefined,
              FileDiffUtil.getDiffHTML(fileChangeInfo.diff, fileChangeInfo.name)
            ),
            ...(fileIndex === 0
              ? [
                  createRowDataParam(
                    'status',
                    this.getMigrationStatus(lwcAssessmentInfo),
                    false,
                    changeInfosCount,
                    1,
                    false,
                    undefined,
                    this.getMigrationStatus(lwcAssessmentInfo),
                    this.getMigrationStatusCssClass(lwcAssessmentInfo)
                  ),
                  createRowDataParam(
                    'errors',
                    lwcAssessmentInfo.errors ? lwcAssessmentInfo.errors.join(', ') : '',
                    false,
                    changeInfosCount,
                    1,
                    false,
                    undefined,
                    lwcAssessmentInfo.errors,
                    this.getMigrationStatusCssClass(lwcAssessmentInfo, true)
                  ),
                ]
              : []),
          ],
        });
      }
    }

    return rows;
  }

  private static getFilterGroupsForReport(lwcAssessmentInfos: LWCAssessmentInfo[]): FilterGroupParam[] {
    if (!lwcAssessmentInfos || lwcAssessmentInfos.length === 0) {
      return [];
    }

    const distinctStatuses = [...new Set(lwcAssessmentInfos.map((info) => this.getMigrationStatus(info)))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [createFilterGroupParam('Filter By Assessment Status', 'status', distinctStatuses)]
        : [];

    return [...statusFilterGroupParam];
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'File Reference',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'File Diff',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Assessment Status',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Errors',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }

  private static getMigrationStatus(lwcAssessmentInfo: LWCAssessmentInfo): string {
    if (lwcAssessmentInfo.errors && lwcAssessmentInfo.errors.length > 0) {
      return 'Failed';
    }
    if (lwcAssessmentInfo.warnings && lwcAssessmentInfo.warnings.length > 0) {
      return 'Warnings';
    }
    return 'Ready for migration';
  }

  private static getMigrationStatusCssClass(lwcAssessmentInfo: LWCAssessmentInfo, noClassForSuccess = false): string {
    if (lwcAssessmentInfo.errors && lwcAssessmentInfo.errors.length > 0) {
      return 'text-error';
    }
    if (lwcAssessmentInfo.warnings && lwcAssessmentInfo.warnings.length > 0) {
      return 'text-warning';
    }
    return noClassForSuccess ? '' : 'text-success';
  }
}

import { expect } from '@salesforce/command/lib/test';
import { Connection } from '@salesforce/core';
import sinon = require('sinon');
import { OrgPreferences } from '../../src/utils/orgPreferences';

describe('OrgPreferences', () => {
  let connection: Connection;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    connection = {
      metadata: {
        update: sandbox.stub(),
      },
      query: sandbox.stub(),
    } as unknown as Connection;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('enableOmniPreferences', () => {
    it('should successfully enable OmniStudio preferences', async () => {
      // Arrange
      const metadataUpdateStub = sandbox.stub().resolves();
      connection.metadata.update = metadataUpdateStub;

      // Act
      await OrgPreferences.enableOmniPreferences(connection);

      // Assert
      expect(metadataUpdateStub.calledOnce).to.be.true;
      expect(metadataUpdateStub.firstCall.args[0]).to.equal('OmniStudioSettings');
      expect(metadataUpdateStub.firstCall.args[1]).to.deep.equal([
        {
          fullName: 'OmniStudio',
          disableRollbackFlagsPref: true,
        },
      ]);
    });

    it('should throw error when enabling preferences fails', async () => {
      // Arrange
      const error = new Error('Failed to update metadata');
      connection.metadata.update = sandbox.stub().rejects(error);

      // Act & Assert
      try {
        await OrgPreferences.enableOmniPreferences(connection);
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).to.equal('Failed to enable disableRollbackFlagsPref: Failed to update metadata');
        } else {
          expect.fail('Expected an Error object');
        }
      }
    });
  });

  describe('checkRollbackFlags', () => {
    it('should return empty array when no flags are enabled', async () => {
      // Arrange
      const queryResult = {
        records: [
          { DeveloperName: 'RollbackIPChanges', Value: 'false' },
          { DeveloperName: 'RollbackDRChanges', Value: 'false' },
          { DeveloperName: 'RollbackOSChanges', Value: 'false' },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.checkRollbackFlags(connection);

      // Assert
      expect(result).to.be.an('array').that.is.empty;
      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.include('SELECT DeveloperName, Value FROM OmniInteractionConfig');
    });

    it('should return array of enabled flags', async () => {
      // Arrange
      const queryResult = {
        records: [
          { DeveloperName: 'RollbackIPChanges', Value: 'true' },
          { DeveloperName: 'RollbackDRChanges', Value: 'false' },
          { DeveloperName: 'RollbackOSChanges', Value: 'true' },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.checkRollbackFlags(connection);

      // Assert
      expect(result).to.deep.equal(['RollbackIPChanges', 'RollbackOSChanges']);
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should throw error when checking flags fails', async () => {
      // Arrange
      const error = new Error('Failed to query');
      connection.query = sandbox.stub().rejects(error);

      // Act & Assert
      try {
        await OrgPreferences.checkRollbackFlags(connection);
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).to.equal('Failed to check rollback flags: Failed to query');
        } else {
          expect.fail('Expected an Error object');
        }
      }
    });
  });
});

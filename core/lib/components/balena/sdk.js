/*
 * Copyright 2017 balena
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const map = require('lodash/map');
const pick = require('lodash/pick');
const find = require('lodash/find');
const flatMapDeep = require('lodash/flatMapDeep');

const Bluebird = require('bluebird');
const retry = require('bluebird-retry');

const utils = require('../../common/utils');

module.exports = class BalenaSDK {
	constructor(
		apiUrl,
		logger = { log: console.log, status: console.log, info: console.log },
	) {
		this.balena = require('balena-sdk')({
			apiUrl: `https://api.${apiUrl}`,
			imageMakerUrl: `https://img.${apiUrl}`,
		});

		this.pine = this.balena.pine;
		this.logger = logger;
	}

	async executeCommandInHostOS(
		command,
		device,
		timeout = {
			interval: 10000,
			tries: 60,
		},
	) {
		const sshPort = 22;

		return retry(
			async () => {
				if (!(await this.isDeviceConnectedToVpn(device))) {
					throw new Error(`${device}: is not marked as connected to our VPN.`);
				}

				const result = await utils.executeCommandOverSSH(
					`host -s ${device} source /etc/profile ; ${command}`,
					{
						host: `ssh.${await this.balena.settings.get('proxyUrl')}`,
						username: await this.balena.auth.whoami(),
						port: sshPort,
					},
				);

				if (result.code !== 0) {
					throw new Error(
						`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`,
					);
				}

				return result.stdout;
			},
			{
				max_tries: timeout.tries,
				interval: timeout.interval,
				throw_original: true,
			},
		);
	}

	getAllSupportedOSVersions(deviceType) {
		return this.balena.models.os.getSupportedVersions(deviceType);
	}

	async getDownloadStream(deviceType, version) {
		const stream = await this.balena.models.os.download(deviceType, version);

		stream.on('progress', data => {
			this.logger.status({
				message: 'Download',
				percentage: data.percentage,
				eta: data.eta,
			});
		});

		return stream;
	}

	getApplicationOSConfiguration(application, options) {
		return this.balena.models.os.getConfig(application, options);
	}

	async getDeviceOSConfiguration(uuid, apiKey, version) {
		const application = await this.balena.models.device.getApplicationName(
			uuid,
		);
		const configuration = await this.getApplicationOSConfiguration(
			application,
			{
				version,
			},
		);
		const device = await this.balena.models.device.get(uuid);

		configuration.registered_at = Math.floor(Date.now() / 1000);
		configuration.deviceId = device.id;
		configuration.uuid = uuid;
		configuration.deviceApiKey = apiKey;
		return configuration;
	}

	async getApplicationGitRemote(application) {
		const repo = await this.balena.models.application
			.get(application)
			.get('slug');
		const config = await this.balena.models.config.getAll();
		const user = await this.balena.auth.whoami();
		return `${user}@${config.gitServerUrl}:${repo}.git`;
	}

	loginWithToken(apiKey) {
		this.logger.log('Balena login!');
		return this.balena.auth.loginWithToken(apiKey);
	}

	logout() {
		this.logger.log('Log out of balena');
		return this.balena.auth.logout();
	}

	removeApplication(application) {
		this.logger.log(`Removing balena application: ${application}`);
		return this.balena.models.application.remove(application);
	}

	async createApplication(name, deviceType, config) {
		this.logger.log(
			`Creating application: ${name} with device type ${deviceType}`,
		);

		await this.balena.models.application.create({
			name,
			deviceType,
		});

		if (config.delta) {
			this.logger.log(
				config.delta === '1' ? 'Enabling delta' : 'Disabling delta',
			);
			await this.balena.setAppConfigVariable(
				name,
				'RESIN_SUPERVISOR_DELTA',
				config.delta,
			);
		}
	}

	getApplicationDevices(application) {
		return map(
			this.balena.models.device.getAllByApplication(application),
			'id',
		);
	}

	addSSHKey(label, key) {
		this.logger.log(`Add new SSH key with label: ${label}`);
		return this.balena.models.key.create(label, key);
	}

	async removeSSHKey(label) {
		this.logger.log(`Delete SSH key with label: ${label}`);

		const keys = await this.balena.models.key.getAll();
		const key = find(keys, {
			title: label,
		});

		if (key) {
			return this.balena.models.key.remove(key.id);
		}

		return Bluebird.resolve();
	}

	isDeviceOnline(device) {
		return this.balena.models.device.isOnline(device);
	}

	isDeviceConnectedToVpn(device) {
		return this.balena.models.device.get(device).get('is_connected_to_vpn');
	}

	getDeviceHostOSVariant(device) {
		return this.balena.models.device.get(device).get('os_variant');
	}

	getDeviceHostOSVersion(device) {
		return this.balena.models.device.get(device).get('os_version');
	}

	getDeviceCommit(device) {
		return this.balena.models.device.get(device).get('is_on__commit');
	}

	getApplicationCommit(application) {
		return this.balena.models.application.get(application).get('commit');
	}

	getSupervisorVersion(device) {
		return this.balena.models.device.get(device).get('supervisor_version');
	}

	getDeviceStatus(device) {
		return this.balena.models.device.get(device).get('status');
	}

	getDeviceProvisioningState(device) {
		return this.balena.models.device.get(device).get('provisioning_state');
	}

	getDeviceProvisioningProgress(device) {
		return this.balena.models.device.get(device).get('provisioning_progress');
	}

	async getLastConnectedTime(device) {
		return new Date(
			await this.balena.models.device
				.get(device)
				.get('last_connectivity_event'),
		);
	}

	getDashboardUrl(device) {
		return this.balena.models.device.getDashboardUrl(device);
	}

	getApiUrl() {
		return this.balena.pine.API_URL;
	}

	generateUUID() {
		return this.balena.models.device.generateUniqueKey();
	}

	async register(application, uuid) {
		const applicationId = await this.balena.models.application
			.get(application)
			.get('id');
		const deviceApiKey = (
			await this.balena.models.device.register(applicationId, uuid)
		).api_key;
		return deviceApiKey;
	}

	setAppConfigVariable(application, key, value) {
		return this.balena.models.application.configVar.set(
			application,
			key,
			value,
		);
	}

	async getAllServicesProperties(device, properties) {
		return flatMapDeep(
			await this.balena.models.device
				.getWithServiceDetails(device)
				.get('current_services'),
			services => {
				return map(services, service => {
					if (properties.length === 1) {
						return service[properties[0]];
					}

					return pick(service, properties);
				});
			},
		);
	}

	getEmail() {
		return this.balena.auth.getEmail();
	}

	pingSupervisor(device) {
		return this.balena.models.device.ping(device);
	}

	async getVpnInstaceIp(device) {
		const response = await this.pine.get({
			resource: 'service_instance',
			options: {
				$select: 'ip_address',
				$filter: {
					manages__device: {
						$any: {
							$alias: 'result',
							$expr: {
								result: {
									uuid: device,
								},
							},
						},
					},
				},
			},
		});

		if (response.length !== 1) {
			throw new Error(`Could not find VPN instance for: ${device}`);
		}

		return response[0].ip_address;
	}

	enableDeviceUrl(device) {
		return this.balena.models.device.enableDeviceUrl(device);
	}

	disableDeviceUrl(device) {
		return this.balena.models.device.disableDeviceUrl(device);
	}

	getDeviceUrl(device) {
		return this.balena.models.device.getDeviceUrl(device);
	}

	moveDeviceToApplication(device, application) {
		return this.balena.models.device.move(device, application);
	}

	getDeviceLogsHistory(device) {
		return this.balena.logs.history(device);
	}

	getDevices(application) {
		return this.balena.models.device.getAllByApplication(application);
	}

	removeDevice(device) {
		return this.balena.models.device.remove(device);
	}

	getMaxSatisfyingVersion(deviceType, range) {
		return this.balena.models.os.getMaxSatisfyingVersion(deviceType, range);
	}

	startOsUpdate(device, targetVersion) {
		this.logger.log(`Updating OS of ${device} to ${targetVersion}`);
		return this.balena.models.device.startOsUpdate(device, targetVersion);
	}

	getOsUpdateStatus(device) {
		return this.balena.models.device.getOsUpdateStatus(device);
	}

	async disableAutomaticUpdates(application) {
		return this.pine.patch({
			resource: 'application',
			id: await this.getApplicationId(application),
			body: {
				should_track_latest_release: false,
			},
		});
	}

	enableAutomaticUpdate(application) {
		return this.balena.models.application.trackLatestRelease(application);
	}

	getLatestRelease(application) {
		return this.balena.models.release
			.getLatestByApplication(application)
			.get('commit');
	}

	getToken() {
		return this.balena.auth.getToken();
	}

	getApplicationId(application) {
		return this.balena.models.application.get(application).get('id');
	}

	async triggerDeviceUpdate(device) {
		await utils.waitUntil(async () => {
			await this.pingSupervisor(device);
			return true;
		});

		await this.balena.models.device.update(device);
	}

	async setConfigurationVar(device, key, value) {
		await this.balena.models.device.configVar.set(device, key, value);
	}

	async removeConfigurationVar(device, key) {
		await this.balena.models.device.configVar.remove(device, key);
	}

	async getServiceNames(device) {
		return Object.keys(
			await this.balena.models.device
				.getWithServiceDetails(device)
				.get('current_services'),
		);
	}
};

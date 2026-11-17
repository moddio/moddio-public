enum CompetitionStatus {
	StartingCompetition,
	Active,
	ParticipationClosed,
	Closed,
}

class Competition {
	public id: string | null;
	public participants: any[];
	public details: any;
	// null means infinite duration
	public duration: number | null;
	// null means infinite max participants number
	public maxParticipantsNumber: number | null;
	public participationCost: {
		min: number | null;
		max: number | null;
	};
	public interval: NodeJS.Timeout;
	private competitionBeingClosed: boolean;
	private status: CompetitionStatus;
	private lastUpdateData: any;

	constructor() {
		this.reset();
	}

	reset() {
		this.participants = [];
		this.details = {};
		this.duration = null;
		this.maxParticipantsNumber = null;
		this.participationCost = {
			min: 0,
			max: 0,
		};

		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
		this.competitionBeingClosed = false;
		this.status = CompetitionStatus.Closed;

		this.id = null;
	}

	startCompetition(duration: number, maxParticipantsNumber: number, minCost: number, maxCost: number) {
		if (this.status !== CompetitionStatus.Closed) {
			throw new Error('a competition is already active, please end it first');
		}

		this.reset();
		// just a random id to uniquely identify the competition
		this.id = taro.newIdHex();
		this.duration = duration;
		this.maxParticipantsNumber = maxParticipantsNumber;
		this.participationCost = {
			min: minCost,
			max: maxCost,
		};

		if (minCost === undefined || minCost === null || typeof minCost !== 'number') {
			throw new Error('minCost is required');
		}

		if (minCost === 0 || minCost < 0) {
			throw new Error('minCost must be greater than 0');
		}

		minCost = minCost ?? 0;
		minCost = minCost < 0 ? 0 : minCost;
		maxCost = maxCost ?? 10e9;
		maxCost = maxCost < 0 ? 0 : maxCost;
		maxCost = maxCost < minCost ? minCost : maxCost;

		if (typeof maxCost !== 'number' || typeof minCost !== 'number') {
			throw new Error('cost needs to be either undefined or a number');
		}

		this.status = CompetitionStatus.StartingCompetition;
		this.updateUi('competitionStarting');

		taro.workerComponent
			?.startCompetition({
				maxParticipantsNumber,
			})
			.then(({ data, err }) => {
				if (data && !err) {
					this.status = CompetitionStatus.Active;
					this.details = data.competitionDetails;
					taro.script?.trigger('competitionAcceptingPlayers');
					this.startTimer();
				} else {
					console.log('startCompetition error:', err);

					// handle error
					this.updateUi('competitionFailed', {
						error: 'Competition failed to start, check server logs for details.',
					});

					setTimeout(() => {
						this.updateUi('');
					}, 3000);

					taro.script.errorLog(`startCompetition error: ${err}`);
					this.reset();
				}
			});
	}

	updateUi(type: string, extraData?: any) {
		// this.lastUpdateData = {
		//     type,
		//     extraData,
		// };
		taro.network.send('ui', {
			command: 'competition',
			action: 'updateCompetitionUi',
			type,
			extraData,
		});
	}

	closeParticipationInCompetition() {
		// prevent multiple calls to closeParticipationInCompetition caused due to race conditions.
		if (this.competitionBeingClosed) {
			console.log('closeParticipationInCompetition > competitionBeingClosed > multiple calls. Skipping...');
			return;
		}

		this.competitionBeingClosed = true;

		const competingPlayers = this.getCompetingPlayers();

		if (competingPlayers.length <= 1) {
			this.updateUi('competitionProcessing');

			// to avoid further calls to get competition details
			if (this.interval) {
				clearInterval(this.interval);
			}
		} else {
			this.updateUi('closingCompetitionParticipation');
		}

		taro.workerComponent?.closeParticipationInCompetition({
			participantCount: competingPlayers?.length || 0,
		}).then(async ({ data, err }) => {
			if (data && !err) {
				console.log('closeParticipationInCompetition > data', data, err);

				if (data.closeAsNotEnoughParticipants) {
					console.log('closeParticipationInCompetition > closeAsNotEnoughParticipants', err);
					taro.script.errorLog(`closeParticipationInCompetition > closeAsNotEnoughParticipants`);
					this.updateUi('closeAsNotEnoughParticipants');
					setTimeout(() => {
						this.updateUi('');
					}, 5000);
					this.reset();
					taro.script?.trigger('competitionClosed');
					return;
				}

				this.status = CompetitionStatus.ParticipationClosed;
				if (
					(!this.details && data.competitionDetails?.participantCount > 0) ||
					this.details.participantCount !== data.competitionDetails.participantCount
				) {
					const { data, err } = await taro.workerComponent?.getCompetitionParticipants();
					if (data && !err) {
						this.updateParticipants(data || []);
					} else {
						console.log('closeParticipationInCompetition > getCompetitionParticipants err', err);
					}
				}

				this.details = data.competitionDetails;

				this.updateUi('competitionStarted');
				setTimeout(() => {
					this.updateUi('competitionInProgress');
				}, 1000);
				taro.script?.trigger('competitionBegins');
			} else {
				console.log('closeParticipationInCompetition err', err);
				taro.script.errorLog(`closeParticipationInCompetition error: ${err}`);
			}
		});
	}

	updateParticipants(participants: any[]) {
		this.participants = participants.map((participant) => ({
			...participant,
			amountUi: this.details?.decimals ? participant.amount / Math.pow(10, this.details.decimals) : undefined,
		}));
	}

	startTimer() {
		if (taro.isServer) {
			const durationExists = this.duration ?? false;
			let currentParticipantsCount = 0;
			if (durationExists) {
				this.interval = setInterval(() => {
					console.log('competition starting...', this.duration);
					if (this.duration <= 0) {
						this.closeParticipationInCompetition();
						clearInterval(this.interval);
						return;
					} else {
						this.updateUi('competitionStartingIn', {
							duration: this.duration,
							participantsCount: currentParticipantsCount,
							maxParticipantsNumber: this.maxParticipantsNumber,
						});
					}
					this.duration--;
				}, 1000);
			} else {
				this.updateUi('competitionWaitingForParticipants', {
					participantsCount: currentParticipantsCount,
					maxParticipantsNumber: this.maxParticipantsNumber,
				});
			}

			const recursivelyFetchCompetitionDetails = async (id: string, previousTime: number, retryCount = 0) => {
				if (this.id !== id || this.status !== CompetitionStatus.Active) {
					return;
				}

				const timeToWait = Math.max(2500 - (Date.now() - previousTime), 0);
				await new Promise((resolve) => setTimeout(resolve, timeToWait));

				const startTime = Date.now();

				try {
					const { data, err } = await taro.workerComponent?.getCompetitionDetails();

					if (data && !err) {
						this.details = data;
						if (currentParticipantsCount !== this.details.participantCount) {
							currentParticipantsCount = this.details.participantCount;
							if (!durationExists) {
								this.updateUi('competitionWaitingForParticipants', {
									participantsCount: currentParticipantsCount,
									maxParticipantsNumber: this.maxParticipantsNumber,
								});
							}
							const { data, err } = await taro.workerComponent?.getCompetitionParticipants();
							if (data && !err) {
								this.updateParticipants(data || []);
							} else {
								console.log('recursivelyFetchCompetitionDetails > getCompetitionParticipants err', err);
							}
						}
						if (this.maxParticipantsNumber && this.details.participantCount === this.maxParticipantsNumber) {
							clearInterval(this.interval);
							this.closeParticipationInCompetition();
							return;
						}

						recursivelyFetchCompetitionDetails(id, startTime, 0);
					} else {
						throw err;
					}
				} catch (error) {
					console.log('competition > startTimer > recursivelyFetchCompetitionDetails: err', error);
					const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
					await new Promise((resolve) => setTimeout(resolve, backoffDelay));
					recursivelyFetchCompetitionDetails(id, startTime, retryCount + 1);
				}
			};

			recursivelyFetchCompetitionDetails(this.id, Date.now());
		}
	}

	getCompetingPlayers() {
		return taro.$$('player').filter((player: any) => {
			return this.participants.some((participant: any) => participant.playerUserId === player._stats.userId);
		});
	}

	endCompetitionAndDistributeRewards(attrId: string) {
		if (!attrId) {
			throw new Error('attrId is required');
		}

		if (this.status !== CompetitionStatus.ParticipationClosed && this.status !== CompetitionStatus.Active) {
			throw new Error('a competition is not started, please start it first');
		}

		const competingPlayers = this.getCompetingPlayers();

		// Calculate weighted scores based on both attribute value and bet amount
		let totalWeightedScore = 0;
		competingPlayers.forEach((player: any) => {
			const participant = this.participants.find((p) => p.playerUserId === player._stats.userId);
			const attrValue = player._stats.attributes[attrId]?.value ?? 0;
			const betAmount = participant?.amount ?? 0;
			const weightedScore = attrValue * betAmount;
			totalWeightedScore += weightedScore;
		});

		let playersToRewardCount = 0;
		const participantsNew = this.participants.map((participant) => {
			const player = competingPlayers.find((player: any) => player._stats.userId === participant.playerUserId);
			const attrValue = player._stats.attributes[attrId]?.value ?? 0;
			const weightedScore = attrValue * participant.amount;

			// Calculate reward based on weighted contribution to the pool
			const rewardAmount = Math.min(
				this.details.totalPot * (weightedScore / totalWeightedScore),
				participant.amount * this.participants.length
			) || 0;

			if (typeof rewardAmount === 'number' && rewardAmount > 0) {
				playersToRewardCount++;
			}
			return {
				...participant,
				rewardAmount,
			};
		});

		
		if (participantsNew.length <= 1) {
			this.updateUi('competitionProcessing');

			if (this.interval) {
				clearInterval(this.interval);
			}
		} else {
			this.updateUi('rewardingPlayers');
		}

		taro.workerComponent
			?.endCompetition({
				participants: participantsNew,
			})
			.then(({ data, err }) => {
				console.log('endCompetitionAndDistributeRewards > data', data, err);
				if (data && !err) {

					if (data.closeAsNotEnoughParticipants) {
						this.reset();
						console.log('closeParticipationInCompetition > closeAsNotEnoughParticipants', err);
						taro.script.errorLog(`closeParticipationInCompetition > closeAsNotEnoughParticipants`);
						this.updateUi('closeAsNotEnoughParticipants');
						setTimeout(() => {
							this.updateUi('');
						}, 5000);
						taro.script?.trigger('competitionClosed');
						return;
					}

					this.status = CompetitionStatus.Closed;
					this.updateParticipants(participantsNew);
					this.updateUi('competitionEnded');
					setTimeout(() => {
						this.updateUi('');
					}, 1000);
					taro.script?.trigger('competitionEnds');
				} else {
					console.log('endCompetitionAndDistributeRewards > err', err);
					taro.script.errorLog(`endCompetitionAndDistributeRewards error: ${err}`);
				}
			});
	}

	askPlayerToJoinCompetition(player: any) {
		if (this.status !== CompetitionStatus.Active) {
			throw new Error('competition is not started yet.');
		}

		if (player && player._stats.clientId) {
			taro.network.send(
				'ui',
				{
					command: 'competition',
					action: 'askPlayerToJoinCompetition',
					participationCost: this.participationCost,
				},
				player._stats.clientId
			);
		}
	}
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = Competition;
}

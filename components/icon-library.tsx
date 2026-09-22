/**
 * Pulsaria's single icon source.
 *
 * The app consumes semantic aliases from this module so the visual language
 * can change without rewriting every component. Phosphor is the underlying
 * family: its duotone weight gives the interface a soft, dreamcore layer
 * while keeping the existing icon contracts and accessible SVG props.
 */
import { forwardRef } from 'react';
import type { Icon, IconProps } from '@phosphor-icons/react';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  BookmarkIcon,
  BellIcon,
  BrainIcon,
  CalendarIcon,
  CameraIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartBarIcon,
  ChatCircleDotsIcon,
  CheckIcon,
  ChecksIcon,
  CircleNotchIcon,
  ClockIcon,
  CodeIcon,
  CopyIcon,
  CpuIcon,
  CubeIcon,
  DatabaseIcon,
  DownloadIcon,
  DotsSixVerticalIcon,
  EyeIcon,
  EyeSlashIcon,
  FileTextIcon,
  FilmStripIcon,
  FolderIcon,
  FunnelIcon,
  GaugeIcon,
  GearIcon,
  HardDriveIcon,
  HardDrivesIcon,
  HeartIcon,
  HouseIcon,
  ImagesIcon,
  InfoIcon,
  LightningIcon,
  ListIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  MusicNoteIcon,
  PaletteIcon,
  PaperPlaneTiltIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PushPinIcon,
  RobotIcon,
  ScalesIcon,
  ShareIcon,
  ShareNetworkIcon,
  ShieldCheckIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  SquaresFourIcon,
  SquareIcon,
  StarIcon,
  StackIcon,
  SlidersHorizontalIcon,
  SubtitlesIcon,
  TerminalIcon,
  TimerIcon,
  TrashIcon,
  TranslateIcon,
  UserCircleGearIcon,
  UserIcon,
  VideoIcon,
  WarningIcon,
  WaveSineIcon,
  WrenchIcon,
  XIcon,
} from '@phosphor-icons/react';

type PulsariaIconProps = Omit<IconProps, 'ref'> & { title?: string };

/** Apply the shared dreamcore treatment while allowing local overrides. */
const withDreamcoreWeight = (IconComponent: Icon) => {
  const Wrapped = forwardRef<SVGSVGElement, PulsariaIconProps>((props, ref) => {
    const { title, ...iconProps } = props;
    const className = ['pulsaria-icon', props.className].filter(Boolean).join(' ') || undefined;

    return (
      <IconComponent
        {...iconProps}
        ref={ref}
        className={className}
        weight={props.weight ?? 'duotone'}
      >
        {title ? <title>{title}</title> : null}
      </IconComponent>
    );
  });
  Wrapped.displayName = `PulsariaIcon(${IconComponent.displayName ?? IconComponent.name ?? 'Icon'})`;
  return Wrapped;
};

export const FaTriangleExclamation = withDreamcoreWeight(WarningIcon);
export const FaArrowRotateLeft = withDreamcoreWeight(ArrowCounterClockwiseIcon);
export const FaArrowLeft = withDreamcoreWeight(ArrowLeftIcon);
export const FaArrowUpRightFromSquare = withDreamcoreWeight(ArrowSquareOutIcon);
export const FaBolt = withDreamcoreWeight(LightningIcon);
export const FaBookmark = withDreamcoreWeight(BookmarkIcon);
export const FaBell = withDreamcoreWeight(BellIcon);
export const FaBrain = withDreamcoreWeight(BrainIcon);
export const FaCalendarDay = withDreamcoreWeight(CalendarIcon);
export const FaCamera = withDreamcoreWeight(CameraIcon);
export const FaChartSimple = withDreamcoreWeight(ChartBarIcon);
export const FaChevronLeft = withDreamcoreWeight(CaretLeftIcon);
export const FaChevronRight = withDreamcoreWeight(CaretRightIcon);
export const FaCheck = withDreamcoreWeight(CheckIcon);
export const FaCheckDouble = withDreamcoreWeight(ChecksIcon);
export const FaClock = withDreamcoreWeight(ClockIcon);
export const FaClone = withDreamcoreWeight(CopyIcon);
export const FaCopy = withDreamcoreWeight(CopyIcon);
export const FaCode = withDreamcoreWeight(CodeIcon);
export const FaMicrochip = withDreamcoreWeight(CpuIcon);
export const FaCube = withDreamcoreWeight(CubeIcon);
export const FaDatabase = withDreamcoreWeight(DatabaseIcon);
export const FaHardDrive = withDreamcoreWeight(HardDriveIcon);
export const FaDownload = withDreamcoreWeight(DownloadIcon);
export const FaEye = withDreamcoreWeight(EyeIcon);
export const FaEyeSlash = withDreamcoreWeight(EyeSlashIcon);
export const FaExpand = withDreamcoreWeight(SquaresFourIcon);
export const FaFileContract = withDreamcoreWeight(FileTextIcon);
export const FaFileLines = withDreamcoreWeight(FileTextIcon);
export const FaFilter = withDreamcoreWeight(FunnelIcon);
export const FaFolder = withDreamcoreWeight(FolderIcon);
export const FaGaugeHigh = withDreamcoreWeight(GaugeIcon);
export const FaHeart = withDreamcoreWeight(HeartIcon);
export const FaHouse = withDreamcoreWeight(HouseIcon);
export const FaInfo = withDreamcoreWeight(InfoIcon);
export const FaLanguage = withDreamcoreWeight(TranslateIcon);
export const FaTableList = withDreamcoreWeight(ListIcon);
export const Loader2 = withDreamcoreWeight(CircleNotchIcon);
export const FaCommentDots = withDreamcoreWeight(ChatCircleDotsIcon);
export const FaMinus = withDreamcoreWeight(MinusIcon);
export const FaFilm = withDreamcoreWeight(FilmStripIcon);
export const FaMusic = withDreamcoreWeight(MusicNoteIcon);
export const FaPalette = withDreamcoreWeight(PaletteIcon);
export const FaPhotoFilm = withDreamcoreWeight(ImagesIcon);
export const FaThumbtack = withDreamcoreWeight(PushPinIcon);
export const FaPlay = withDreamcoreWeight(PlayIcon);
export const FaPause = withDreamcoreWeight(PauseIcon);
export const FaPlus = withDreamcoreWeight(PlusIcon);
export const FaMemory = withDreamcoreWeight(CpuIcon);
export const FaRotate = withDreamcoreWeight(ArrowClockwiseIcon);
export const FaRobot = withDreamcoreWeight(RobotIcon);
export const FaRotateLeft = withDreamcoreWeight(ArrowCounterClockwiseIcon);
export const FaScaleBalanced = withDreamcoreWeight(ScalesIcon);
export const FaMagnifyingGlass = withDreamcoreWeight(MagnifyingGlassIcon);
export const FaPaperPlane = withDreamcoreWeight(PaperPlaneTiltIcon);
export const FaServer = withDreamcoreWeight(HardDrivesIcon);
export const FaGear = withDreamcoreWeight(GearIcon);
export const FaShare = withDreamcoreWeight(ShareIcon);
export const FaShareNodes = withDreamcoreWeight(ShareNetworkIcon);
export const FaShieldHalved = withDreamcoreWeight(ShieldCheckIcon);
export const FaSquare = withDreamcoreWeight(SquareIcon);
export const FaStar = withDreamcoreWeight(StarIcon);
export const FaLayerGroup = withDreamcoreWeight(StackIcon);
export const FaStopwatch = withDreamcoreWeight(TimerIcon);
export const FaClosedCaptioning = withDreamcoreWeight(SubtitlesIcon);
export const FaTableCells = withDreamcoreWeight(SquaresFourIcon);
export const FaTerminal = withDreamcoreWeight(TerminalIcon);
export const FaWrench = withDreamcoreWeight(WrenchIcon);
export const FaTrash = withDreamcoreWeight(TrashIcon);
export const FaTrashCan = withDreamcoreWeight(TrashIcon);
export const FaUser = withDreamcoreWeight(UserIcon);
export const FaUserShield = withDreamcoreWeight(UserCircleGearIcon);
export const FaVideo = withDreamcoreWeight(VideoIcon);
export const FaVolumeHigh = withDreamcoreWeight(SpeakerHighIcon);
export const FaVolumeXmark = withDreamcoreWeight(SpeakerSlashIcon);
export const FaWandMagicSparkles = withDreamcoreWeight(MagicWandIcon);
export const FaWaveSquare = withDreamcoreWeight(WaveSineIcon);
export const FaClose = withDreamcoreWeight(XIcon);
export const FaXmark = withDreamcoreWeight(XIcon);
export const FaSliders = withDreamcoreWeight(SlidersHorizontalIcon);
export const FaGrip = withDreamcoreWeight(DotsSixVerticalIcon);
export const FaArrowDownAZ = withDreamcoreWeight(SortAscendingIcon);
export const FaArrowDownWideShort = withDreamcoreWeight(SortDescendingIcon);

import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prepare_whisper_model import repair_files


class RepairFilesTests(unittest.TestCase):
    def test_repair_preserves_valid_files(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            staging = root / "staging"
            destination = root / "model"
            staging.mkdir()
            destination.mkdir()

            (staging / "config.json").write_bytes(b"config-valid")
            (staging / "tokenizer.json").write_bytes(b"tokenizer-valid")
            (staging / "model.bin").write_bytes(b"model-valid")
            (destination / "config.json").write_bytes(b"config-valid")
            (destination / "tokenizer.json").write_bytes(b"tokenizer-corrupt")
            (destination / "model.bin").write_bytes(b"model-valid")

            original_config = (destination / "config.json").read_bytes()
            original_model = (destination / "model.bin").read_bytes()
            replaced = repair_files(staging, destination, ("config.json", "tokenizer.json", "model.bin"))

            self.assertEqual(replaced, ["tokenizer.json"])
            self.assertEqual((destination / "config.json").read_bytes(), original_config)
            self.assertEqual((destination / "model.bin").read_bytes(), original_model)
            self.assertEqual((destination / "tokenizer.json").read_bytes(), b"tokenizer-valid")


if __name__ == "__main__":
    unittest.main()
